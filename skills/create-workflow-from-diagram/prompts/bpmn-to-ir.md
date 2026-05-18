# BPMN 2.0 XML → IR

Use this prompt when the input is a **BPMN 2.0 XML** file (`.bpmn`, `.bpmn20.xml`, or `.xml` with the `http://www.omg.org/spec/BPMN/20100524/MODEL` namespace). The XML is structured and self-describing, so no vision is required — parse it deterministically and emit the same JSON-Lines IR format defined in `ir-schema.md`.

## Element → IR record mapping

| BPMN element | IR record | Notes |
|---|---|---|
| `<bpmn:process id="...">` | `workflow` metadata | Use `@id` for the workflow name (camelCased) |
| `<bpmn:participant>` inside `<bpmn:collaboration>` | `participant` record | One record per participant / swim lane |
| `<bpmn:lane>` | `participant` record | Swim lanes model participants inside a single pool |
| `<bpmn:startEvent>` | `start` record | |
| `<bpmn:endEvent>` | `end` record | Inspect child event definitions: `<bpmn:errorEventDefinition>` → terminal error; `<bpmn:terminateEventDefinition>` → hard stop |
| `<bpmn:task>` | `activity` record, type `task` | |
| `<bpmn:serviceTask>` | `activity` record, type `task` | `serviceTask` → automated activity |
| `<bpmn:userTask>` | `activity` record, type `task` with `requires_human_input: true` | HITL wait |
| `<bpmn:scriptTask>` | `activity` record, type `task` | |
| `<bpmn:sendTask>` | `activity` record, type `task` | Outbound message |
| `<bpmn:receiveTask>` | `activity` record, type `wait_for_event` | |
| `<bpmn:businessRuleTask>` | `activity` record, type `task` | |
| `<bpmn:manualTask>` | `activity` record, type `task` with `requires_human_input: true` | |
| `<bpmn:subProcess>` | `activity` record, type `child_workflow` | Nested process body becomes the child workflow body |
| `<bpmn:callActivity>` | `activity` record, type `child_workflow` | Referenced process id from `calledElement` |
| `<bpmn:exclusiveGateway>` | `gateway` record, type `exclusive` | Role (split vs merge) is inferred from flow direction |
| `<bpmn:parallelGateway>` | `gateway` record, type `parallel` | Role: split (> 1 outgoing) / merge (> 1 incoming) |
| `<bpmn:inclusiveGateway>` | `gateway` record, type `inclusive` | |
| `<bpmn:eventBasedGateway>` | `gateway` record, type `event_based` | |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:timerEventDefinition>` | `activity` record, type `timer` | Duration parsed from `<bpmn:timeDuration>` (ISO 8601) |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:messageEventDefinition>` | `activity` record, type `wait_for_event` | Event name from `messageRef` |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:signalEventDefinition>` | `activity` record, type `wait_for_event` | Event name from `signalRef` |
| `<bpmn:boundaryEvent>` with `<bpmn:errorEventDefinition>` | `error_handler` record attached to the parent activity | |
| `<bpmn:boundaryEvent>` with `<bpmn:timerEventDefinition>` | `timeout` attribute on the parent activity | |
| `<bpmn:sequenceFlow>` | `edge` record | `@sourceRef` → `from`, `@targetRef` → `to`; child `<bpmn:conditionExpression>` → `condition` |
| `<bpmn:dataObject>` / `<bpmn:dataObjectReference>` | `artifact` record | Referenced by activities via `<bpmn:dataInputAssociation>` / `<bpmn:dataOutputAssociation>` |
| `<bpmn:messageFlow>` | `edge` record with `cross_participant: true` | Between pools |

## Extraction rules

1. **IDs**: keep BPMN `@id` values as IR element ids. They are already unique within the document.
2. **Labels**: prefer `@name` attribute for human-readable label; fall back to `@id` if no name.
3. **Gateway role**:
   - Outgoing edge count > 1 and incoming = 1 → `split`
   - Incoming > 1 and outgoing = 1 → `merge`
   - Otherwise → infer from edge count majority and flag as `unrecognized_item` if ambiguous
4. **Data flow**: map `<bpmn:dataInputAssociation>` → `input` artifact flow; `<bpmn:dataOutputAssociation>` → `output`.
5. **Conditional flows**: `<bpmn:conditionExpression>` text becomes the `condition` field on the edge. Preserve the original expression syntax.
6. **Default flows**: `@default` attribute on an exclusive gateway marks that sequence flow as `default: true` in the IR.
7. **Timer durations**: parse ISO-8601 `PT...` values into a normalised `{ value: <N>, unit: <seconds|minutes|hours|days> }` struct.
8. **Swim lanes**: each `<bpmn:lane>` becomes a `participant`. Tasks inside a lane carry `participant_id` = lane id.
9. **Collaboration**: if the file has `<bpmn:collaboration>`, produce one `workflow` per participating `<bpmn:process>`; link them via `messageFlow` edges with `cross_participant: true`.

## Unsupported BPMN features

Emit an `unrecognized_item` IR record (per `ir-schema.md`) for each of:

- `<bpmn:adHocSubProcess>`
- `<bpmn:transaction>`
- `<bpmn:complexGateway>`
- Multi-instance markers on tasks / sub-processes (flag as warning; treat as single instance)
- Compensation events and compensation handlers
- Escalation events

## Output format

Same JSON-Lines IR as the image path. Follow `ir-schema.md` for record shapes. Do not emit any fields not defined there.

## Minimal example

Input (excerpt):

```xml
<bpmn:process id="orderProcess" name="Order Process">
  <bpmn:startEvent id="start" name="Order Received" />
  <bpmn:task id="validate" name="Validate Order" />
  <bpmn:exclusiveGateway id="approved" name="Approved?" default="toReject" />
  <bpmn:task id="fulfill" name="Fulfill" />
  <bpmn:task id="reject" name="Reject" />
  <bpmn:endEvent id="done" />
  <bpmn:sequenceFlow sourceRef="start" targetRef="validate" />
  <bpmn:sequenceFlow sourceRef="validate" targetRef="approved" />
  <bpmn:sequenceFlow id="toFulfill" sourceRef="approved" targetRef="fulfill">
    <bpmn:conditionExpression>${approved == true}</bpmn:conditionExpression>
  </bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="toReject" sourceRef="approved" targetRef="reject" />
  <bpmn:sequenceFlow sourceRef="fulfill" targetRef="done" />
  <bpmn:sequenceFlow sourceRef="reject" targetRef="done" />
</bpmn:process>
```

Expected IR (abbreviated):

```jsonl
{"type":"workflow","id":"orderProcess","name":"Order Process"}
{"type":"start","id":"start","label":"Order Received"}
{"type":"activity","id":"validate","label":"Validate Order","activity_type":"task"}
{"type":"gateway","id":"approved","label":"Approved?","gateway_type":"exclusive","role":"split","default_edge":"toReject"}
{"type":"activity","id":"fulfill","label":"Fulfill","activity_type":"task"}
{"type":"activity","id":"reject","label":"Reject","activity_type":"task"}
{"type":"end","id":"done"}
{"type":"edge","from":"start","to":"validate"}
{"type":"edge","from":"validate","to":"approved"}
{"type":"edge","id":"toFulfill","from":"approved","to":"fulfill","condition":"${approved == true}"}
{"type":"edge","id":"toReject","from":"approved","to":"reject"}
{"type":"edge","from":"fulfill","to":"done"}
{"type":"edge","from":"reject","to":"done"}
```

After the IR is emitted, proceed to Phase 2 (validate) and Phase 3 (code) exactly as for the image path.
