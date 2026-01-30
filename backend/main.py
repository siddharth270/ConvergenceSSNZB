"""
AI Medical Scribe MVP - FastAPI Backend

This application provides API endpoints for clinical documentation assistance.
It converts audio recordings to structured notes using Ollama (Llama 3.2) and local Whisper.
Data is persisted to Supabase for patient history and record keeping.

IMPORTANT: This tool is for documentation assistance only and does not provide 
medical diagnosis or treatment recommendations.
"""

import os
import tempfile
import logging
import re
import uuid
from typing import Dict, Any, Optional, List
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ValidationError
import json
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dotenv import load_dotenv
import httpx

from supabase_client import get_supabase_client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="AI Medical Scribe MVP",
    description="Clinical documentation assistance API with Supabase persistence",
    version="1.0.0"
)

# Configure CORS for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local development
        "http://localhost:8080",  # Vite dev server
        "http://localhost:3000",  # Alternative local dev
        "https://ambient-notes.vercel.app",  # Vercel default domain
        "https://dochearscribe.com",  # Custom domain
        "https://www.dochearscribe.com",  # WWW subdomain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ollama configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# Whisper model (lazy loaded)
whisper_model = None


def get_whisper_model():
    """Lazy load Whisper model to save memory on startup"""
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
        device = os.getenv("WHISPER_DEVICE", "cpu")
        compute_type = "int8" if device == "cpu" else "float16"
        
        logger.info(f"Loading Whisper model: {model_size} on {device}")
        whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info("Whisper model loaded successfully")
    return whisper_model


async def call_ollama(messages: list, temperature: float = 0.1) -> str:
    """Call Ollama API for chat completion."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": temperature,
                        "num_predict": 4000,
                    },
                    "format": "json"
                }
            )
            response.raise_for_status()
            result = response.json()
            return result["message"]["content"]
        except httpx.TimeoutException:
            logger.error("Ollama request timed out")
            raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama HTTP error: {e}")
            raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


def extract_json_from_response(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    
    raise ValueError(f"Could not extract valid JSON from response: {text[:500]}...")


# Configure Jinja2 template engine
templates_dir = Path(__file__).parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(templates_dir),
    autoescape=select_autoescape(['html', 'xml'])
)


# ============== Pydantic Models ==============

class SummarizeRequest(BaseModel):
    """Request model for note summarization endpoint."""
    transcript: str
    note_type: str  # "soap" or "prescription"
    visit_type: str  # "new", "followup", "repeat"
    patient_name: str
    patient_id: str
    doctor_id: str  # Required for saving to database
    conversation_id: Optional[str] = None  # Link to existing conversation
    soap_context: Optional[Dict[str, Any]] = None


class Medication(BaseModel):
    """Model for prescription medications."""
    name: str
    dose: str
    route: str
    frequency: str
    duration: str
    instructions: str = ""


class SOAPNote(BaseModel):
    """Model for SOAP note structure."""
    conversation_summary: str
    subjective: str
    objective: str
    assessment: str
    plan: str
    key_insights: str
    admin_tasks: list[str] = []


class PrescriptionNote(BaseModel):
    """Model for prescription note structure."""
    patient_name: str
    patient_id: str
    chief_complaint: str = ""
    symptoms: list[str] = []
    diagnosis: str = ""
    vital_signs: dict = {}
    medications: list[Medication]
    instructions: str = ""
    warnings: list[str] = []
    follow_up: str = ""


class RenderRequest(BaseModel):
    """Request model for note rendering endpoint."""
    note_type: str
    note_data: Dict[str, Any]
    patient_name: str
    patient_id: str
    visit_type: str = "followup"
    doctor_name: str = "Dr. [Your Name]"


class PatientCreate(BaseModel):
    """Model for creating a new patient."""
    name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    medical_history: Optional[str] = None
    allergies: Optional[str] = None
    current_medications: Optional[str] = None


class DoctorCreate(BaseModel):
    """Model for creating/registering a doctor."""
    name: str
    email: str
    specialty: Optional[str] = None
    license_number: Optional[str] = None
    phone: Optional[str] = None


# ============== Health & Root Endpoints ==============

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    ollama_status = "unknown"
    supabase_status = "unknown"
    
    # Check Ollama
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            ollama_status = "connected" if response.status_code == 200 else "error"
    except Exception:
        ollama_status = "disconnected"
    
    # Check Supabase
    try:
        supabase = get_supabase_client()
        supabase.table('doctors').select('count').limit(1).execute()
        supabase_status = "connected"
    except Exception:
        supabase_status = "disconnected"
    
    return {
        "status": "healthy",
        "service": "AI Medical Scribe MVP",
        "version": "1.0.0",
        "ollama_status": ollama_status,
        "ollama_model": OLLAMA_MODEL,
        "supabase_status": supabase_status,
        "disclaimer": "For documentation assistance only - not for medical diagnosis"
    }


@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint with API information."""
    return {
        "message": "AI Medical Scribe MVP API",
        "health": "/health",
        "docs": "/docs",
        "disclaimer": "For documentation assistance only - requires clinician review"
    }


# ============== Doctor Endpoints ==============

@app.post("/api/doctors")
async def create_doctor(doctor: DoctorCreate) -> Dict[str, Any]:
    """Register a new doctor."""
    try:
        supabase = get_supabase_client()
        
        # Check if doctor with email already exists
        existing = supabase.table('doctors').select('id').eq('email', doctor.email).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Doctor with this email already exists")
        
        result = supabase.table('doctors').insert({
            "name": doctor.name,
            "email": doctor.email,
            "specialty": doctor.specialty,
            "license_number": doctor.license_number,
            "phone": doctor.phone
        }).execute()
        
        logger.info(f"Created doctor: {result.data[0]['id']}")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating doctor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors/{doctor_id}")
async def get_doctor(doctor_id: str) -> Dict[str, Any]:
    """Get doctor by ID."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('doctors').select('*').eq('id', doctor_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching doctor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/doctors")
async def list_doctors() -> List[Dict[str, Any]]:
    """List all doctors."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('doctors').select('*').order('name').execute()
        return result.data
    except Exception as e:
        logger.error(f"Error listing doctors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== Patient Endpoints ==============

@app.post("/api/patients")
async def create_patient(patient: PatientCreate, doctor_id: str = Query(...)) -> Dict[str, Any]:
    """Create a new patient."""
    try:
        supabase = get_supabase_client()
        
        result = supabase.table('patients').insert({
            "name": patient.name,
            "date_of_birth": patient.date_of_birth,
            "gender": patient.gender,
            "phone": patient.phone,
            "email": patient.email,
            "address": patient.address,
            "medical_history": patient.medical_history,
            "allergies": patient.allergies,
            "current_medications": patient.current_medications,
            "doctor_id": doctor_id
        }).execute()
        
        logger.info(f"Created patient: {result.data[0]['id']}")
        return result.data[0]
    except Exception as e:
        logger.error(f"Error creating patient: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str) -> Dict[str, Any]:
    """Get patient by ID with their history."""
    try:
        supabase = get_supabase_client()
        
        # Get patient info
        patient = supabase.table('patients').select('*').eq('id', patient_id).execute()
        if not patient.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Get recent SOAP notes
        soap_notes = supabase.table('soap_notes').select('*').eq('patient_id', patient_id).order('created_at', desc=True).limit(10).execute()
        
        # Get recent prescriptions
        prescriptions = supabase.table('prescriptions').select('*').eq('patient_id', patient_id).order('created_at', desc=True).limit(10).execute()
        
        return {
            **patient.data[0],
            "recent_soap_notes": soap_notes.data,
            "recent_prescriptions": prescriptions.data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching patient: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/patients")
async def list_patients(doctor_id: str = Query(...)) -> List[Dict[str, Any]]:
    """List all patients for a doctor."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('patients').select('*').eq('doctor_id', doctor_id).order('name').execute()
        return result.data
    except Exception as e:
        logger.error(f"Error listing patients: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== Transcription Endpoint ==============

@app.post("/api/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    patient_id: str = Form(None),
    doctor_id: str = Form(None)
) -> Dict[str, Any]:
    """
    Transcribe audio file using local Whisper model.
    Optionally saves conversation to database if patient_id and doctor_id provided.
    """
    MAX_FILE_SIZE = 25 * 1024 * 1024
    
    audio_content = await audio.read()
    if len(audio_content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Audio file too large. Maximum size is 25MB.")
    
    allowed_types = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "video/webm"]
    if audio.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {audio.content_type}")
    
    temp_file = None
    try:
        file_extension = ".webm"
        if "mp4" in audio.content_type:
            file_extension = ".mp4"
        elif "mpeg" in audio.content_type:
            file_extension = ".mp3"
        elif "wav" in audio.content_type:
            file_extension = ".wav"
        elif "ogg" in audio.content_type:
            file_extension = ".ogg"
            
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension, prefix="scribe_audio_")
        temp_file.write(audio_content)
        temp_file.flush()
        temp_file.close()
        
        logger.info(f"Saved audio file: {temp_file.name} ({len(audio_content)} bytes)")
        
        # Transcribe with Whisper
        logger.info("Transcribing audio with local Whisper model...")
        model = get_whisper_model()
        
        segments, info = model.transcribe(
            temp_file.name,
            language="en",
            beam_size=5,
            best_of=5,
            vad_filter=True,
        )
        
        transcript_text = " ".join([segment.text for segment in segments]).strip()
        
        logger.info(f"Transcription successful: {len(transcript_text)} characters")
        
        if not transcript_text:
            raise HTTPException(status_code=400, detail="No speech detected in audio file.")
        
        # Save conversation to database if IDs provided
        conversation_id = None
        if patient_id and doctor_id:
            try:
                supabase = get_supabase_client()
                conv_result = supabase.table('conversations').insert({
                    "patient_id": patient_id,
                    "doctor_id": doctor_id,
                    "transcript": transcript_text,
                    "audio_duration": info.duration
                }).execute()
                conversation_id = conv_result.data[0]['id']
                logger.info(f"Saved conversation: {conversation_id}")
            except Exception as e:
                logger.warning(f"Failed to save conversation: {e}")
        
        return {
            "transcript": transcript_text,
            "status": "success",
            "audio_duration": f"{info.duration:.1f} seconds",
            "conversation_id": conversation_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")
    finally:
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file: {e}")


# ============== Summarization Endpoint ==============

@app.post("/api/summarize")
async def summarize_transcript(request: SummarizeRequest) -> Dict[str, Any]:
    """
    Generate structured clinical note from transcript using Ollama.
    Saves the generated note to Supabase.
    """
    if not request.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript cannot be empty")
    
    if request.note_type not in ["soap", "prescription"]:
        raise HTTPException(status_code=400, detail="Note type must be 'soap' or 'prescription'")
    
    if request.visit_type not in ["new", "followup", "repeat"]:
        raise HTTPException(status_code=400, detail="Visit type must be 'new', 'followup', or 'repeat'")
    
    logger.info(f"Generating {request.note_type} note for patient {request.patient_id}")
    
    # System prompt with anti-hallucination guardrails
    guardrail_prompt = """You are a clinical documentation assistant for transcription ONLY. 

🚨 CRITICAL ANTI-HALLUCINATION RULES:

1. EXACT TRANSCRIPTION ONLY: Document ONLY what was explicitly stated in the conversation. Do NOT:
   - Infer or assume any medical information
   - Add standard medical advice not mentioned
   - Suggest diagnoses, treatments, or medications not discussed
   - Fill in missing details with "typical" or "common" information

2. MISSING INFORMATION PROTOCOL:
   - If a field has NO information in the transcript, leave it as empty string "" or empty list []
   - Do NOT use placeholder text like "Not specified", "To be determined"

3. VERBATIM EXTRACTION:
   - Copy medical terms, medication names, and dosages EXACTLY as stated
   - Do NOT standardize, correct, or modify medical terminology

4. OUTPUT FORMAT: You MUST respond with valid JSON only. No explanations, no markdown, just the JSON object.

Your role: Extract and structure what was said. Nothing more, nothing less."""

    # Build schema prompt based on note type
    if request.note_type == "soap":
        schema_prompt = """Generate a SOAP note. Respond with ONLY this JSON structure:

{
  "conversation_summary": "Brief summary as a single text string",
  "subjective": "Patient-reported information as a single text string",
  "objective": "Clinical findings as a single text string (NOT a dictionary)",
  "assessment": "Diagnosis as a single text string",
  "plan": "Treatment plan as a single text string (NOT a list)",
  "key_insights": "Critical insights as a single text string",
  "admin_tasks": ["task1", "task2"]
}

CRITICAL RULES:
- subjective, objective, assessment, plan, key_insights MUST be text strings
- Do NOT use nested objects or dictionaries for these fields
- Only admin_tasks should be an array
- All other fields are plain text strings

Example of CORRECT format:
{
  "subjective": "Patient has headache for 2 days",
  "objective": "BP 120/80, HR 72, no fever",
  "assessment": "Tension headache",
  "plan": "Ibuprofen 400mg as needed, rest, follow up in 1 week"
}

Example of WRONG format (do NOT do this):
{
  "objective": {"vital_signs": {"bp": "120/80"}},
  "plan": ["Ibuprofen", "Rest"]
}

Remember: Use simple text strings, not nested structures."""

    else:  # prescription
        soap_context_str = ""
        if request.soap_context:
            soap_context_str = f"""
CLINICAL CONTEXT FROM SOAP NOTE:
- Assessment: {request.soap_context.get('assessment', '')}
- Subjective: {request.soap_context.get('subjective', '')}
- Plan: {request.soap_context.get('plan', '')}
"""
        
        schema_prompt = f"""Generate a detailed medical prescription based on the consultation transcript. {soap_context_str}

Respond with ONLY this JSON structure:

{{
  "chief_complaint": "Primary reason for visit (single text string)",
  "symptoms": ["symptom1", "symptom2", "symptom3"],
  "diagnosis": "Primary medical diagnosis based on consultation",
  "vital_signs": {{
    "blood_pressure": "e.g., 120/80 mmHg",
    "heart_rate": "e.g., 72 bpm",
    "temperature": "e.g., 98.6°F or 37°C",
    "respiratory_rate": "e.g., 16 breaths/min",
    "oxygen_saturation": "e.g., 98%",
    "weight": "e.g., 70 kg"
  }},
  "medications": [
    {{
      "name": "Full medication name (brand or generic)",
      "dose": "Specific dosage with unit (e.g., 500mg, 10ml)",
      "route": "Administration route (Oral, IV, Topical, etc.)",
      "frequency": "How often (e.g., Twice daily, Every 8 hours, As needed)",
      "duration": "Treatment duration (e.g., 7 days, 2 weeks, Until symptoms resolve)",
      "instructions": "Detailed patient instructions (e.g., Take with food, Avoid alcohol, Take before bedtime)"
    }}
  ],
  "instructions": "General patient care instructions and lifestyle recommendations",
  "warnings": [
    "Important side effects to watch for",
    "When to seek immediate medical attention",
    "Drug interactions or contraindications"
  ],
  "follow_up": "Follow-up timeline and what to monitor (e.g., Return in 2 weeks for re-evaluation)"
}}

CRITICAL EXTRACTION RULES:
1. ONLY extract information EXPLICITLY mentioned in the transcript
2. For medications: Include ONLY drugs the doctor specifically prescribed
3. If vital signs weren't mentioned, use empty strings: ""
4. If no warnings discussed, use empty list: []
5. Dosage must include units (mg, ml, tablets, etc.)
6. Frequency must be clear (times per day, specific intervals)
7. Duration must specify time period (days, weeks, until condition improves)
8. Instructions should be patient-friendly and actionable

QUALITY STANDARDS FOR MEDICATIONS:
- Name: Use exact drug name mentioned by doctor
- Dose: Must include measurement unit (500mg, NOT just "500")
- Route: Standard medical terms (Oral, Intravenous, Subcutaneous, Topical, Inhalation)
- Frequency: Be specific (Twice daily, Every 6 hours, Before meals, At bedtime)
- Duration: Clear timeframe (7 days, 2 weeks, 1 month, As needed for up to 14 days)
- Instructions: Practical guidance (Take with full glass of water, Avoid dairy products, May cause drowsiness)

If no medications were prescribed, use empty array: []
If information is missing, use empty strings "" or empty arrays [], DO NOT invent or assume."""

    user_prompt = f"""
Patient: {request.patient_name} (ID: {request.patient_id})
Visit Type: {request.visit_type}

Transcript:
{request.transcript}

{schema_prompt}"""

    # Call Ollama
    logger.info(f"Calling Ollama ({OLLAMA_MODEL}) for note generation...")
    
    messages = [
        {"role": "system", "content": guardrail_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    try:
        generated_content = await call_ollama(messages, temperature=0.1)
        logger.info(f"Generated content length: {len(generated_content)} characters")
        
        try:
            note_json = extract_json_from_response(generated_content)
            logger.info("Successfully parsed generated JSON")
            
            # Validate and save to database
            supabase = get_supabase_client()
            
            if request.note_type == "soap":
                 # Ensure required fields are present
                if 'patient_id' not in note_json:
                    note_json['patient_id'] = request.patient_id
                if 'doctor_id' not in note_json:
                    note_json['doctor_id'] = request.doctor_id
                if 'visit_type' not in note_json:
                    note_json['visit_type'] = request.visit_type
                
                # Convert dict/list fields to strings
                if isinstance(note_json.get('subjective'), (dict, list)):
                    note_json['subjective'] = str(note_json['subjective'])
                if isinstance(note_json.get('objective'), (dict, list)):
                    note_json['objective'] = str(note_json['objective'])
                if isinstance(note_json.get('assessment'), (dict, list)):
                    note_json['assessment'] = str(note_json['assessment'])
                if isinstance(note_json.get('plan'), (dict, list)):
                    note_json['plan'] = str(note_json['plan'])
                    
                validated_note = SOAPNote(**note_json)
                note_data = validated_note.model_dump()
                            
                # Save SOAP note to database
                db_result = supabase.table('soap_notes').insert({
                    "patient_id": request.patient_id,
                    "doctor_id": request.doctor_id,
                    "conversation_id": request.conversation_id,
                    "visit_type": request.visit_type,
                    "conversation_summary": note_data["conversation_summary"],
                    "subjective": note_data["subjective"],
                    "objective": note_data["objective"],
                    "assessment": note_data["assessment"],
                    "plan": note_data["plan"],
                    "key_insights": note_data["key_insights"],
                    "admin_tasks": note_data["admin_tasks"]
                }).execute()
                
                note_id = db_result.data[0]['id']
                logger.info(f"Saved SOAP note: {note_id}")
                
                return {**note_data, "id": note_id, "note_type": "soap"}
            
            else:  # prescription
                # Ollama doesn't generate these - we provide them
                note_json['patient_name'] = request.patient_name
                note_json['patient_id'] = request.patient_id
                
                validated_note = PrescriptionNote(**note_json)
                note_data = validated_note.model_dump()
                
                # Save prescription to database
                prescription_result = supabase.table('prescriptions').insert({
                    "patient_id": request.patient_id,
                    "doctor_id": request.doctor_id,
                    "conversation_id": request.conversation_id,
                    "chief_complaint": note_data["chief_complaint"],
                    "symptoms": note_data["symptoms"],
                    "diagnosis": note_data["diagnosis"],
                    "vital_signs": note_data["vital_signs"],
                    "instructions": note_data["instructions"],
                    "warnings": note_data["warnings"],
                    "follow_up": note_data["follow_up"]
                }).execute()
                
                prescription_id = prescription_result.data[0]['id']
                logger.info(f"Saved prescription: {prescription_id}")
                
                # Save medications
                for med in note_data["medications"]:
                    supabase.table('medications').insert({
                        "prescription_id": prescription_id,
                        "name": med["name"],
                        "dose": med["dose"],
                        "route": med["route"],
                        "frequency": med["frequency"],
                        "duration": med["duration"],
                        "instructions": med.get("instructions", "")
                    }).execute()
                
                logger.info(f"Saved {len(note_data['medications'])} medications")
                
                return {**note_data, "id": prescription_id, "note_type": "prescription"}
                
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Invalid JSON generated: {e}")
            # Retry once
            retry_prompt = user_prompt + "\n\nIMPORTANT: Respond with valid JSON only."
            retry_content = await call_ollama([
                {"role": "system", "content": guardrail_prompt},
                {"role": "user", "content": retry_prompt}
            ], temperature=0.05)
            
            try:
                note_json = extract_json_from_response(retry_content)
                if request.note_type == "soap":
                    # Ensure required fields
                    if 'patient_id' not in note_json:
                        note_json['patient_id'] = request.patient_id
                    if 'doctor_id' not in note_json:
                        note_json['doctor_id'] = request.doctor_id
                    if 'visit_type' not in note_json:
                        note_json['visit_type'] = request.visit_type
                    
                    # Convert dict/list fields to strings
                    if isinstance(note_json.get('subjective'), (dict, list)):
                        note_json['subjective'] = str(note_json['subjective'])
                    if isinstance(note_json.get('objective'), (dict, list)):
                        note_json['objective'] = str(note_json['objective'])
                    if isinstance(note_json.get('assessment'), (dict, list)):
                        note_json['assessment'] = str(note_json['assessment'])
                    if isinstance(note_json.get('plan'), (dict, list)):
                        note_json['plan'] = str(note_json['plan'])
                        
                    validated_note = SOAPNote(**note_json)
                    return validated_note.model_dump()
                else:
                    validated_note = PrescriptionNote(**note_json)
                    return validated_note.model_dump()
            except Exception as retry_error:
                logger.error(f"Retry failed: {retry_error}")
                raise HTTPException(status_code=500, detail="AI failed to generate valid note. Please try again.")
        
        except ValidationError as e:
            logger.error(f"Schema validation error: {e}")
            raise HTTPException(status_code=500, detail="Generated note doesn't match required format.")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error during note generation")


# ============== History Endpoints ==============

@app.get("/api/soap-notes/{note_id}")
async def get_soap_note(note_id: str) -> Dict[str, Any]:
    """Get a specific SOAP note."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('soap_notes').select('*').eq('id', note_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="SOAP note not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/soap-notes")
async def list_soap_notes(
    patient_id: str = Query(None),
    doctor_id: str = Query(None),
    limit: int = Query(20, le=100)
) -> List[Dict[str, Any]]:
    """List SOAP notes with optional filtering."""
    try:
        supabase = get_supabase_client()
        query = supabase.table('soap_notes').select('*')
        
        if patient_id:
            query = query.eq('patient_id', patient_id)
        if doctor_id:
            query = query.eq('doctor_id', doctor_id)
        
        result = query.order('created_at', desc=True).limit(limit).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prescriptions/{prescription_id}")
async def get_prescription(prescription_id: str) -> Dict[str, Any]:
    """Get a specific prescription with medications."""
    try:
        supabase = get_supabase_client()
        
        # Get prescription
        prescription = supabase.table('prescriptions').select('*').eq('id', prescription_id).execute()
        if not prescription.data:
            raise HTTPException(status_code=404, detail="Prescription not found")
        
        # Get medications
        medications = supabase.table('medications').select('*').eq('prescription_id', prescription_id).execute()
        
        return {
            **prescription.data[0],
            "medications": medications.data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prescriptions")
async def list_prescriptions(
    patient_id: str = Query(None),
    doctor_id: str = Query(None),
    limit: int = Query(20, le=100)
) -> List[Dict[str, Any]]:
    """List prescriptions with optional filtering."""
    try:
        supabase = get_supabase_client()
        query = supabase.table('prescriptions').select('*')
        
        if patient_id:
            query = query.eq('patient_id', patient_id)
        if doctor_id:
            query = query.eq('doctor_id', doctor_id)
        
        result = query.order('created_at', desc=True).limit(limit).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations")
async def list_conversations(
    patient_id: str = Query(None),
    doctor_id: str = Query(None),
    limit: int = Query(20, le=100)
) -> List[Dict[str, Any]]:
    """List conversations/transcripts."""
    try:
        supabase = get_supabase_client()
        query = supabase.table('conversations').select('*')
        
        if patient_id:
            query = query.eq('patient_id', patient_id)
        if doctor_id:
            query = query.eq('doctor_id', doctor_id)
        
        result = query.order('created_at', desc=True).limit(limit).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Render Endpoint ==============

@app.post("/api/render")
async def render_note(request: RenderRequest) -> HTMLResponse:
    """Render structured note as printable HTML."""
    if request.note_type not in ["soap", "prescription"]:
        raise HTTPException(status_code=400, detail="Note type must be 'soap' or 'prescription'")
    
    if not request.note_data:
        raise HTTPException(status_code=400, detail="Note data cannot be empty")
    
    logger.info(f"Rendering {request.note_type} note for patient {request.patient_id}")
    
    try:
        template_name = f"{request.note_type}.html"
        template = jinja_env.get_template(template_name)
        
        template_context = {
            "note": request.note_data,
            "patient_name": request.patient_name,
            "patient_id": request.patient_id,
            "visit_type": request.visit_type,
            "doctor_name": request.doctor_name,
            "current_date": datetime.now().strftime("%B %d, %Y"),
            "current_time": datetime.now().strftime("%I:%M %p")
        }
        
        rendered_html = template.render(**template_context)
        
        return HTMLResponse(
            content=rendered_html,
            status_code=200,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
        
    except Exception as e:
        logger.error(f"Error rendering template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to render note template: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)