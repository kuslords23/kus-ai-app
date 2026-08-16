#!/bin/bash

if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "Error: OPENROUTER_API_KEY is not set"
  exit 1
fi

PROMPT="$1"
MODEL="anthropic/claude-sonnet-4"

if [ -z "$PROMPT" ]; then
  echo "Usage: ./ai.sh \"your question\""
  exit 1
fi

RESPONSE=$(curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [
      {\"role\": \"system\", \"content\": \"You are a helpful coding assistant.\"},
      {\"role\": \"user\", \"content\": \"$PROMPT\"}
    ]
  }")

echo "$RESPONSE" | py -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'choices' in data:
        print(data['choices'][0]['message']['content'])
    else:
        print('Error from OpenRouter:')
        print(json.dumps(data, indent=2))
except Exception as e:
    print('Failed to parse response:', e)
    print(sys.stdin.read())
"
