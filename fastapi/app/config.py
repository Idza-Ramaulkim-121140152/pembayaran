import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # Database
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_DATABASE: str = "pembayaran"
    DB_USERNAME: str = "root"
    DB_PASSWORD: str = ""
    
    # FastAPI
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True
    
    # WhatsApp Gateway (Node.js)
    WA_GATEWAY_URL: str = "http://localhost:3001"
    
    @property
    def DATABASE_URL(self) -> str:
        return f"mysql+pymysql://{self.DB_USERNAME}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_DATABASE}"
    
    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()
