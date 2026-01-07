@echo off
cd /d d:\Projek\pembayaran\fastapi
d:\Projek\pembayaran\fastapi\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001
pause
