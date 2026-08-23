# resources/llm-provider.yaml — Anthropic

For Anthropic Claude, create an `llm-provider.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: llm-provider
spec:
  type: conversation.anthropic
  version: v1
  metadata:
  - name: key
    value: "{{ANTHROPIC_API_KEY}}"
  - name: model
    value: "claude-sonnet-4-6"
```

- The component name `llm-provider` is the value passed to `DaprChatClient(component_name="llm-provider")` in the agent code.
- `{{ANTHROPIC_API_KEY}}` is a Dapr template variable; set `ANTHROPIC_API_KEY` in the environment before running `dapr run`.
- Valid `model` values include `claude-opus-4-7`, `claude-sonnet-4-6`, and `claude-haiku-4-5`. Default to `claude-sonnet-4-6` for a balance of cost and capability.
- The `conversation.anthropic` building block is part of Dapr; no extra package is required on the agent side.
