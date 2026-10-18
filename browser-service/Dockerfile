FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy
WORKDIR /srv
RUN pip install --no-cache-dir playwright==1.49.1 fastapi==0.115.* uvicorn==0.32.* pydantic==2.*
COPY app ./app
CMD ["python", "-m", "app.main"]
