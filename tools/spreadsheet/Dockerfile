# Use Python 3.9
FROM python:3.9

# Set working directory
WORKDIR /code

# Copy requirements and install
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the files
COPY . .

# Create a writable directory for storage (Hugging Face requirement)
RUN mkdir -p /code/data_sources && chmod 777 /code/data_sources

# Run the app on port 7860 (Hugging Face default)
CMD ["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "7860"]
