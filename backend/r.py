from google import genai

client = genai.Client(api_key="AIzaSyAw5WtpAUmWj8he0IDs3f0qYZ3TGW0cjGU")

# List of models to cycle through
models_to_test = [
    'gemini-1.5-flash-8b', 
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp' # The newest version
]

for model_name in models_to_test:
    try:
        print(f"Testing {model_name}...")
        response = client.models.generate_content(
            model=model_name,
            contents='Hi'
        )
        print(f"✅ SUCCESS with {model_name}: {response.text}")
        break 
    except Exception as e:
        print(f"❌ {model_name} failed: {e}")