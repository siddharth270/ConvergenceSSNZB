"""
AI Medical Scribe MVP - FastAPI Backend

This application provides API endpoints for clinical documentation assistance.
It converts audio recordings to structured notes using OpenAI's services.

IMPORTANT: This tool is for documentation assistance only and does not provide 
medical diagnosis or treatment recommendations.
"""

import os
import tempfile

import logging
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ValidationError
import openai
import json
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="AI Medical Scribe MVP",
    description="Clinical documentation assistance API",
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

# Initialize OpenAI client
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY environment variable is required")

openai_client = openai.OpenAI(api_key=openai_api_key)


# Configure Jinja2 template engine with auto-escaping for security
templates_dir = Path(__file__).parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(templates_dir),
    autoescape=select_autoescape(['html', 'xml'])  # Auto-escape for security
)


# Pydantic models for API requests and responses
class SummarizeRequest(BaseModel):
    """Request model for note summarization endpoint."""
    transcript: str
    note_type: str  # "soap" or "prescription"
    visit_type: str  # "new", "followup", "repeat"
    patient_name: str
    patient_id: str
    soap_context: Optional[Dict[str, Any]] = None  # Optional SOAP note context for prescription generation


class Medication(BaseModel):
    """Model for prescription medications with detailed fields."""
    name: str
    dose: str  # e.g., "500mg", "10ml", "2 tablets"
    route: str  # e.g., "Oral", "IV", "Topical", "IM"
    frequency: str  # e.g., "Twice daily", "Every 8 hours", "As needed"
    duration: str  # e.g., "7 days", "2 weeks", "Ongoing"
    instructions: str = ""  # e.g., "Take with food", "Before bedtime"


class SOAPNote(BaseModel):
    """Model for enhanced SOAP note structure with conversation summary."""
    conversation_summary: str
    subjective: str
    objective: str
    assessment: str
    plan: str
    key_insights: str
    admin_tasks: list[str] = []


class PrescriptionNote(BaseModel):
    """Model for comprehensive prescription note structure."""
    patient_name: str
    patient_id: str
    chief_complaint: str = ""  # What brought the patient in
    symptoms: list[str] = []  # List of symptoms mentioned
    diagnosis: str = ""  # Primary diagnosis or working diagnosis
    vital_signs: dict = {}  # BP, HR, Temp, SpO2, etc. if mentioned
    medications: list[Medication]
    instructions: str = ""  # General patient care instructions
    warnings: list[str] = []  # Side effects, contraindications, when to seek help
    follow_up: str = ""  # Follow-up timeline and instructions


class RenderRequest(BaseModel):
    """Request model for note rendering endpoint."""
    note_type: str  # "soap" or "prescription"
    note_data: Dict[str, Any]  # The structured note JSON
    patient_name: str
    patient_id: str
    visit_type: str = "followup"  # Optional, defaults to followup
    doctor_name: str = "Dr. [Your Name]"  # Optional, doctor's name for prescription

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Health check endpoint to verify the API is running.
    
    Returns:
        Dict with status and service information
    """
    return {
        "status": "healthy",
        "service": "AI Medical Scribe MVP",
        "version": "1.0.0",
        "disclaimer": "For documentation assistance only - not for medical diagnosis"
    }


@app.get("/")
async def root() -> Dict[str, str]:
    """
    Root endpoint with basic API information.
    """
    return {
        "message": "AI Medical Scribe MVP API",
        "health": "/health",
        "docs": "/docs",
        "disclaimer": "For documentation assistance only - requires clinician review"
    }

@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)) -> Dict[str, str]:
    """
    Transcribe audio file using OpenAI Whisper API.
    
    This endpoint:
    1. Accepts multipart file upload (WebM, MP3, MP4, etc.)
    2. Validates file size and format
    3. Saves to temporary storage
    4. Calls OpenAI Whisper API for transcription
    5. Cleans up temporary files
    6. Returns transcript as JSON
    
    Args:
        audio: Audio file from frontend MediaRecorder
        
    Returns:
        Dict containing transcript text
        
    Raises:
        HTTPException: If file is invalid, too large, or transcription fails
    """
    # Validate file size (limit to 25MB as per OpenAI Whisper limits)
    MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB
    
    # Read file content to check size
    audio_content = await audio.read()
    if len(audio_content) > MAX_FILE_SIZE:
        logger.warning(f"File too large: {len(audio_content)} bytes")
        raise HTTPException(
            status_code=413,
            detail="Audio file too large. Maximum size is 25MB."
        )
    
    # Validate file format (check MIME type)
    allowed_types = [
        "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", 
        "audio/x-wav", "audio/ogg", "video/webm"
    ]
    
    if audio.content_type not in allowed_types:
        logger.warning(f"Invalid file type: {audio.content_type}")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {audio.content_type}. "
                   f"Supported formats: WebM, MP4, MP3, WAV, OGG"
        )
    
    # Create temporary file for audio processing
    temp_file = None
    try:
        # Create temporary file with appropriate extension
        file_extension = ".webm"  # Default for WebM from MediaRecorder
        if "mp4" in audio.content_type:
            file_extension = ".mp4"
        elif "mpeg" in audio.content_type:
            file_extension = ".mp3"
        elif "wav" in audio.content_type:
            file_extension = ".wav"
        elif "ogg" in audio.content_type:
            file_extension = ".ogg"
            
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=file_extension,
            prefix="scribe_audio_"
        )
        
        # Write audio content to temporary file
        temp_file.write(audio_content)
        temp_file.flush()
        temp_file.close()
        
        logger.info(f"Saved audio file: {temp_file.name} ({len(audio_content)} bytes)")
        
        # Call OpenAI Whisper API for transcription
        with open(temp_file.name, "rb") as audio_file:
            logger.info("Calling OpenAI Whisper API for transcription...")
            
            transcript_response = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text",  # Return plain text, not JSON
                language="en"  # Specify English for medical terminology
            )
            
        # Extract transcript text
        transcript_text = transcript_response.strip()
        
        logger.info(f"Transcription successful: {len(transcript_text)} characters")
        
        # Validate transcript is not empty
        if not transcript_text:
            raise HTTPException(
                status_code=400,
                detail="No speech detected in audio file. Please ensure clear audio recording."
            )
        
        return {
            "transcript": transcript_text,
            "status": "success",
            "audio_duration_estimate": f"{len(audio_content) // 16000} seconds"  # Rough estimate
        }
        
    except openai.OpenAIError as e:
        logger.error(f"OpenAI API error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription service error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during transcription: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during transcription"
        )
    finally:
        # Clean up temporary file
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
                logger.info(f"Cleaned up temporary file: {temp_file.name}")
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file: {e}")


@app.post("/api/summarize")
async def summarize_transcript(request: SummarizeRequest) -> Dict[str, Any]:
    """
    Generate structured clinical note from transcript using OpenAI GPT.
    
    This endpoint:
    1. Validates input data (transcript, patient info, note type)
    2. Applies medical guardrails via system prompts
    3. Uses strict JSON schemas for note generation
    4. Calls OpenAI GPT-4 with json_object response format
    5. Validates and returns parsed JSON
    
    Args:
        request: SummarizeRequest containing transcript and patient context
        
    Returns:
        Dict containing structured note (SOAP or Prescription format)
        
    Raises:
        HTTPException: If validation fails or AI generation fails
    """
    # Validate input data
    if not request.transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Transcript cannot be empty"
        )
    
    if request.note_type not in ["soap", "prescription"]:
        raise HTTPException(
            status_code=400,
            detail="Note type must be 'soap' or 'prescription'"
        )
    
    if request.visit_type not in ["new", "followup", "repeat"]:
        raise HTTPException(
            status_code=400,
            detail="Visit type must be 'new', 'followup', or 'repeat'"
        )
    
    logger.info(f"Generating {request.note_type} note for patient {request.patient_id}")
    
    try:
        # System prompt with strong anti-hallucination guardrails
        guardrail_prompt = """You are a clinical documentation assistant for transcription ONLY. 

🚨 CRITICAL ANTI-HALLUCINATION RULES:

1. EXACT TRANSCRIPTION ONLY: Document ONLY what was explicitly stated in the conversation. Do NOT:
   - Infer or assume any medical information
   - Add standard medical advice not mentioned
   - Suggest diagnoses, treatments, or medications not discussed
   - Fill in missing details with "typical" or "common" information
   - Make up dosages, frequencies, or durations

2. MISSING INFORMATION PROTOCOL:
   - If a field has NO information in the transcript, leave it as empty string "" or empty list []
   - Do NOT use placeholder text like "Not specified", "To be determined", "As directed"
   - For medications: If dose/route/frequency/duration not mentioned, use "" for that field
   - Better to have incomplete accurate data than complete fabricated data

3. VERBATIM EXTRACTION:
   - Copy medical terms, medication names, and dosages EXACTLY as stated
   - If doctor says "amoxicillin 500 three times a day", extract exactly that
   - Do NOT standardize, correct, or modify medical terminology
   - Do NOT convert units or measurements unless explicitly stated

4. DOCUMENTATION ONLY: You are a transcription tool, not a medical advisor:
   - Never add clinical recommendations
   - Never suggest additional tests or treatments
   - Never provide medical explanations not in the transcript

5. VERIFICATION MINDSET: Before adding ANY information, ask yourself:
   - "Was this EXPLICITLY stated in the conversation?"
   - "Am I inferring this from medical knowledge?"
   - If unsure, LEAVE IT BLANK

Your role: Extract and structure what was said. Nothing more, nothing less."""

        # Schema-specific prompts and JSON schemas
        if request.note_type == "soap":
            schema_prompt = """Generate a comprehensive SOAP note by extracting ALL clinical information from the transcript.

EXTRACTION CHECKLIST - Document if mentioned:
✓ Patient's chief complaint and reason for visit
✓ ALL symptoms with duration, severity, and characteristics
✓ Medical history, allergies, current medications
✓ Vital signs (BP, HR, Temp, SpO2, Weight, etc.)
✓ Physical examination findings
✓ Doctor's assessment and diagnosis
✓ ALL medications prescribed with complete details
✓ Treatment plan and instructions
✓ Follow-up timeline and instructions
✓ Any warnings or red flags discussed

Generate this EXACT JSON structure:

{
  "conversation_summary": "Detailed summary capturing the flow of the consultation. Format: 'Doctor: [question/statement] | Patient: [response]' for key exchanges. Include chief complaint, symptom discussion, examination findings, diagnosis explanation, and treatment plan discussion.",
  
  "subjective": "PATIENT-REPORTED INFORMATION ONLY:
- Chief Complaint: [Why patient came in]
- Symptoms: [All symptoms with onset, duration, severity, aggravating/relieving factors]
- Medical History: [Relevant past medical history mentioned]
- Current Medications: [Medications patient is currently taking]
- Allergies: [Any allergies mentioned]
- Social/Family History: [If discussed]",
  
  "objective": "CLINICAL FINDINGS DOCUMENTED BY DOCTOR:
- Vital Signs: [BP, HR, RR, Temp, SpO2, Weight - if mentioned]
- Physical Examination: [All examination findings by system]
- Lab/Imaging Results: [If discussed]
- Clinical Observations: [Doctor's objective observations]",
  
  "assessment": "DOCTOR'S CLINICAL ASSESSMENT:
- Primary Diagnosis: [Main diagnosis or working diagnosis]
- Differential Diagnoses: [Alternative diagnoses considered]
- Clinical Reasoning: [Doctor's medical analysis and thought process]
- Severity/Prognosis: [If discussed]",
  
  "plan": "TREATMENT PLAN:
- Medications: [List all medications with dose, route, frequency, duration]
- Procedures/Interventions: [Any procedures ordered or performed]
- Lifestyle Modifications: [Diet, exercise, activity restrictions]
- Follow-up: [When to return, what to monitor]
- Referrals: [Specialist referrals if mentioned]
- Patient Education: [Key points discussed with patient]",
  
  "key_insights": "Critical clinical insights: Important patterns, red flags, clinical pearls, or decision-making rationale that informed the diagnosis and treatment approach.",
  
  "admin_tasks": ["List ONLY information that was discussed but needs follow-up, NOT information that wasn't mentioned at all"]
}

CRITICAL: Only document what was EXPLICITLY stated. Use empty sections if information wasn't discussed."""

            json_schema = {
                "type": "object",
                "properties": {
                    "conversation_summary": {"type": "string"},
                    "subjective": {"type": "string"},
                    "objective": {"type": "string"},
                    "assessment": {"type": "string"},
                    "plan": {"type": "string"},
                    "key_insights": {"type": "string"},
                    "admin_tasks": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["conversation_summary", "subjective", "objective", "assessment", "plan", "key_insights", "admin_tasks"]
            }
        else:  # prescription
            # Build context from SOAP note if available
            soap_context_str = ""
            if request.soap_context:
                soap_context_str = f"""
CLINICAL CONTEXT FROM SOAP NOTE:
- Assessment: {request.soap_context.get('assessment', 'Not provided')}
- Subjective findings: {request.soap_context.get('subjective', 'Not provided')}
- Objective findings: {request.soap_context.get('objective', 'Not provided')}
- Plan: {request.soap_context.get('plan', 'Not provided')}

USE THIS CONTEXT to fill in diagnosis, symptoms, and chief complaint if they are not explicitly stated in the transcript.
"""
            
            schema_prompt = f"""Generate a comprehensive prescription by extracting ALL clinical and medication information from the transcript.

{soap_context_str}

CRITICAL: You are a medical documentation assistant. Your job is to EXTRACT information from the conversation, NOT to prescribe medications.

STEP 1: UNDERSTAND THE CLINICAL CONTEXT
- First, identify the chief complaint and symptoms (use SOAP context if not in transcript)
- Then, identify the diagnosis (use SOAP assessment if not explicitly stated in transcript)
- Only THEN extract the medications that the doctor prescribed

STEP 2: MEDICATION EXTRACTION RULES
For EACH medication mentioned by the doctor, you MUST extract these 6 fields separately:
1. name: EXACT medication name as stated by the doctor (generic or brand name)
2. dose: Specific amount with units (e.g., "500mg", "10ml", "2 tablets", "1 puff")
3. route: How to take it (e.g., "Oral", "Topical", "Inhalation", "IV", "IM", "Sublingual")
4. frequency: How often (e.g., "Once daily", "Twice daily", "Three times daily", "Every 6 hours", "As needed")
5. duration: How long (e.g., "7 days", "2 weeks", "30 days", "Until symptoms resolve", "Ongoing")
6. instructions: Special instructions (e.g., "Take with food", "Before bedtime", "On empty stomach")

⚠️ CRITICAL ANTI-HALLUCINATION RULE:
- ONLY extract medications that the doctor EXPLICITLY prescribed in the conversation
- DO NOT suggest or add medications based on the diagnosis or symptoms
- DO NOT add "typical" or "standard" medications for the condition
- If the doctor didn't prescribe any medications, return an empty medications list
- Better to have NO medications than WRONG medications

EXAMPLES:
Doctor says: "Start amoxicillin 500 milligrams by mouth three times a day for one week, take with food"
Extract as:
- name: "Amoxicillin"
- dose: "500mg"
- route: "Oral"
- frequency: "Three times daily"
- duration: "7 days"
- instructions: "Take with food"

Doctor says: "Use the albuterol inhaler, two puffs as needed for shortness of breath"
Extract as:
- name: "Albuterol inhaler"
- dose: "2 puffs"
- route: "Inhalation"
- frequency: "As needed"
- duration: "Ongoing"
- instructions: "For shortness of breath"

Generate this EXACT JSON structure:

{{
  "patient_name": "{request.patient_name}",
  "patient_id": "{request.patient_id}",
  
  "chief_complaint": "Why the patient came in (e.g., 'Cough and fever for 3 days'). Leave empty if not mentioned.",
  
  "symptoms": ["List ALL symptoms mentioned", "Include duration if stated", "Leave empty list if none mentioned"],
  
  "diagnosis": "Primary diagnosis or working diagnosis as stated by doctor. Leave empty if not explicitly stated.",
  
  "vital_signs": {{
    "blood_pressure": "e.g., 120/80",
    "heart_rate": "e.g., 72 bpm",
    "temperature": "e.g., 98.6°F",
    "respiratory_rate": "e.g., 16",
    "oxygen_saturation": "e.g., 98%",
    "weight": "e.g., 70 kg"
  }},
  
  "medications": [
    {{
      "name": "Medication name",
      "dose": "Amount with units",
      "route": "Administration route",
      "frequency": "How often",
      "duration": "How long",
      "instructions": "Special instructions"
    }}
  ],
  
  "instructions": "General patient care instructions, lifestyle modifications, what to do/avoid, when to take medications, etc. Leave empty if not discussed.",
  
  "warnings": ["Side effects to watch for", "When to seek immediate care", "Drug interactions mentioned", "Contraindications discussed"],
  
  "follow_up": "When to return for follow-up, what to monitor at home, when to call doctor. Leave empty if not discussed."
}}

CRITICAL ANTI-HALLUCINATION RULES:
- If a medication field is not mentioned, use empty string "" for that field
- If vital signs not discussed, use empty strings for all vital sign fields
- If no warnings discussed, use empty list []
- Do NOT invent or assume standard medical information
- Do NOT add typical dosing if not stated
- Better to have incomplete data than fabricated data
- Only extract what was EXPLICITLY said in the conversation"""

            json_schema = {
                "type": "object",
                "properties": {
                    "patient_name": {"type": "string"},
                    "patient_id": {"type": "string"},
                    "chief_complaint": {"type": "string"},
                    "symptoms": {"type": "array", "items": {"type": "string"}},
                    "diagnosis": {"type": "string"},
                    "vital_signs": {
                        "type": "object",
                        "properties": {
                            "blood_pressure": {"type": "string"},
                            "heart_rate": {"type": "string"},
                            "temperature": {"type": "string"},
                            "respiratory_rate": {"type": "string"},
                            "oxygen_saturation": {"type": "string"},
                            "weight": {"type": "string"}
                        }
                    },
                    "medications": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "dose": {"type": "string"},
                                "route": {"type": "string"},
                                "frequency": {"type": "string"},
                                "duration": {"type": "string"},
                                "instructions": {"type": "string"}
                            },
                            "required": ["name", "dose", "route", "frequency", "duration"]
                        }
                    },
                    "instructions": {"type": "string"},
                    "warnings": {"type": "array", "items": {"type": "string"}},
                    "follow_up": {"type": "string"}
                },
                "required": ["patient_name", "patient_id", "medications"]
            }

        # Prepare the full prompt
        user_prompt = f"""
Patient Context:
- Name: {request.patient_name}
- ID: {request.patient_id}  
- Visit Type: {request.visit_type}
- Note Type: {request.note_type.upper()}

Transcript:
{request.transcript}

{schema_prompt}"""

        # Call OpenAI GPT-4 for note generation
        logger.info("Calling OpenAI GPT-4 for note generation...")
        
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Cost-effective model for structured output
            messages=[
                {"role": "system", "content": guardrail_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},  # Ensure JSON output
            temperature=0.1,  # Low temperature for consistent, factual output - prevents hallucination
            max_tokens=2000  # Increased limit for comprehensive clinical documentation
        )
        
        # Extract and parse the generated JSON
        generated_content = completion.choices[0].message.content
        logger.info(f"Generated content length: {len(generated_content)} characters")
        
        try:
            # Parse the JSON response
            note_json = json.loads(generated_content)
            logger.info("Successfully parsed generated JSON")
            
            # Validate against our Pydantic models
            if request.note_type == "soap":
                validated_note = SOAPNote(**note_json)
                return validated_note.model_dump()
            else:
                validated_note = PrescriptionNote(**note_json)
                return validated_note.model_dump()
                
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON generated by AI: {e}")
            # Retry once with more explicit instructions
            retry_prompt = user_prompt + "\n\nIMPORTANT: Respond with valid JSON only, no additional text."
            
            retry_completion = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": guardrail_prompt},
                    {"role": "user", "content": retry_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=1500
            )
            
            retry_content = retry_completion.choices[0].message.content
            try:
                note_json = json.loads(retry_content)
                if request.note_type == "soap":
                    validated_note = SOAPNote(**note_json)
                    return validated_note.model_dump()
                else:
                    validated_note = PrescriptionNote(**note_json)
                    return validated_note.model_dump()
            except (json.JSONDecodeError, ValidationError) as retry_error:
                logger.error(f"Retry also failed: {retry_error}")
                raise HTTPException(
                    status_code=500,
                    detail="AI failed to generate valid structured note. Please try again."
                )
        
        except ValidationError as e:
            logger.error(f"Generated JSON doesn't match schema: {e}")
            raise HTTPException(
                status_code=500,
                detail="Generated note doesn't match required format. Please try again."
            )
            
    except openai.OpenAIError as e:
        logger.error(f"OpenAI API error during summarization: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"AI service error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during summarization: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during note generation"
        )


@app.post("/api/render")
async def render_note(request: RenderRequest) -> HTMLResponse:
    """
    Render structured note as printable HTML using Jinja2 templates.
    
    This endpoint:
    1. Validates note type and data structure
    2. Loads appropriate Jinja2 template (soap.html or prescription.html)
    3. Renders template with note data and patient context
    4. Returns HTML ready for printing/PDF generation
    5. Includes print-specific CSS and medical disclaimers
    
    Args:
        request: RenderRequest with note type, data, and patient context
        
    Returns:
        HTMLResponse with rendered template
        
    Raises:
        HTTPException: If note type is invalid or template rendering fails
    """
    # Validate note type
    if request.note_type not in ["soap", "prescription"]:
        raise HTTPException(
            status_code=400,
            detail="Note type must be 'soap' or 'prescription'"
        )
    
    # Validate note data is not empty
    if not request.note_data:
        raise HTTPException(
            status_code=400,
            detail="Note data cannot be empty"
        )
    
    logger.info(f"Rendering {request.note_type} note for patient {request.patient_id}")
    
    try:
        # Select appropriate template
        template_name = f"{request.note_type}.html"
        template = jinja_env.get_template(template_name)
        
        # Prepare template context
        template_context = {
            "note": request.note_data,
            "patient_name": request.patient_name,
            "patient_id": request.patient_id,
            "visit_type": request.visit_type,
            "doctor_name": request.doctor_name,
            "current_date": datetime.now().strftime("%B %d, %Y"),
            "current_time": datetime.now().strftime("%I:%M %p")
        }
        
        # Render the template
        rendered_html = template.render(**template_context)
        
        logger.info(f"Successfully rendered {request.note_type} template")
        
        # Return HTML response with proper content type
        return HTMLResponse(
            content=rendered_html,
            status_code=200,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",  # Don't cache medical documents
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
        
    except Exception as e:
        logger.error(f"Error rendering template: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to render note template: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)