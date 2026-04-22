# resources/llm-provider.yaml — OpenAI

Dapr Agents uses a Dapr Conversation component to call LLMs. For OpenAI, create an `llm-provider.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: llm-provider
spec:
  type: conversation.openai
  version: v1
  metadata:
  - name: key
    value: "{{OPENAI_API_KEY}}"
  - name: model
    value: "gpt-4o-mini"
```

- The component name `llm-provider` is the value passed to `DaprChatClient(component_name="llm-provider")` in the agent code.
- `{{OPENAI_API_KEY}}` is a Dapr template variable; set the `OPENAI_API_KEY` environment variable before running `dapr run`. Do not hardcode the key in this file.
- Swap `model` for any OpenAI chat model (`gpt-4o`, `gpt-4.1`, `gpt-4o-mini`). `gpt-4o-mini` is the cost-optimized default.
- Framework-wrapper projects (openai-agents, langgraph, crewai, etc.) usually bypass this component and call OpenAI directly; they need `OPENAI_API_KEY` in the environment but not this yaml.
