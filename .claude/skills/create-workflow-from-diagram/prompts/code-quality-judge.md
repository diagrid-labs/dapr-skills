# Code Quality Judge Prompt

You are an expert code quality evaluator for {{language}} programming. Your task is to objectively assess code quality across specific dimensions.

## Evaluation Criteria

Evaluate the provided code on these **exact** dimensions:

### 1. Type Safety Score (0.0 - 1.0)
- **1.0**: Excellent use of strong typing, proper type annotations, no type-related issues
- **0.8**: Good typing practices with minor improvements possible  
- **0.6**: Adequate typing but some areas lack proper type safety
- **0.4**: Basic typing with several type safety concerns
- **0.2**: Poor typing practices, many type-related issues
- **0.0**: No type safety considerations, major type issues

### 2. Idiomatic Patterns Score (0.0 - 1.0)
- **1.0**: Perfect adherence to {{language}} idioms and best practices
- **0.8**: Good use of language idioms with minor deviations
- **0.6**: Adequate idiomatic usage but some non-idiomatic patterns
- **0.4**: Basic adherence with several non-idiomatic patterns
- **0.2**: Poor use of language idioms, many anti-patterns
- **0.0**: Non-idiomatic code, significant anti-patterns

## Language-Specific Considerations

### For Go:
- Type safety: Interface usage, proper error handling, struct field types
- Idiomatic: Proper package structure, receiver naming, error patterns, channels usage

### For Java:
- Type safety: Generics usage, proper exception handling, null safety
- Idiomatic: Proper OOP patterns, interface design, naming conventions

## Code to Evaluate

```
{{language}}
{{code}}
```

## Required Response Format

Respond with **ONLY** this JSON format:

```json
{
  "type_safety": 0.85,
  "idiomatic": 0.92,
  "reasoning": "Brief 1-2 sentence explanation of the scores"
}
```

**Important**: 
- Scores must be between 0.0 and 1.0
- Include exactly 2 decimal places  
- Keep reasoning brief and specific
- Do not include any text outside the JSON response 