import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

completion = client.chat.completions.create(
    model="google/gemini-2.5-pro",
    messages=[
        {"role": "user", "content": "Hello! Give me a quick system status check."}
    ]
)

print("\n--- AI Response ---\n")
print(completion.choices[0].message.content)
