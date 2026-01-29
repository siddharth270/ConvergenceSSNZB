

This application uses **free, local AI** for clinical documentation:
- **Ollama + Llama 3.2** for text generation (SOAP notes, prescriptions)
- **Faster-Whisper** for audio transcription (local Whisper model)

## Prerequisites

1. **Python 3.10+**
2. **Ollama** installed and running
3. **FFmpeg** (required by faster-whisper for audio processing)

## Setup Instructions

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download from: https://ollama.com/download

### 2. Start Ollama and Pull the Model

```bash
# Start Ollama service (runs in background)
ollama serve

# In another terminal, pull the Llama 3.2 model
ollama pull llama3.2
```

> **Note:** The first time you pull the model, it will download ~2GB. 
> For better quality (but slower), you can use `llama3.2:3b` or `llama3.1:8b`.

### 3. Install FFmpeg (for audio processing)

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from: https://ffmpeg.org/download.html

### 4. Install Python Dependencies

```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Configure Environment

```bash
# Copy the example .env file
cp .env.example .env

# Edit .env with your Supabase credentials
# (Ollama settings use sensible defaults)
```

### 6. Run the Application

```bash
# Make sure Ollama is running first!
ollama serve  # In a separate terminal if not already running

# Start the FastAPI server
python main.py
```

The API will be available at: http://localhost:8000