import os

# grsai API configuration. The API key is read from the environment so it is
# never hard-coded into the repository.
GRSAI_API_KEY = os.environ.get("GRSAI_API_KEY", "")
GRSAI_BASE_URL = os.environ.get("GRSAI_BASE_URL", "https://grsaiapi.com")

# Models
IMAGE_MODEL = os.environ.get("GRSAI_IMAGE_MODEL", "gpt-image-2")
LLM_MODEL = os.environ.get("GRSAI_LLM_MODEL", "gemini-3.1-flash-lite")

# GeekAI API configuration (used for gpt-image-2 watermark removal).
GEEKAI_API_KEY = os.environ.get("GEEKAI_API_KEY", "")
GEEKAI_BASE_URL = os.environ.get("GEEKAI_BASE_URL", "https://geekai.co/api/v1")
GEEKAI_IMAGE_MODEL = os.environ.get("GEEKAI_IMAGE_MODEL", "gpt-image-2")
GEEKAI_IMAGE_QUALITY = os.environ.get("GEEKAI_IMAGE_QUALITY", "low")

# Networking
REQUEST_TIMEOUT = float(os.environ.get("GRSAI_REQUEST_TIMEOUT", "60"))
