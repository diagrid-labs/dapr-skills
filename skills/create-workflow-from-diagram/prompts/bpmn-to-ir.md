# BPMN 2.0 XML → IR

Use this prompt when the input is a **BPMN 2.0 XML** file (`.bpmn`, `.bpmn20.xml`, or `.xml` with the `http://www.omg.org/spec/BPMN/20100524/MODEL` namespace). The XML is structured and self-describing, so no vision is required — parse it deterministically and emit the **same** JSON Lines IR that the image path emits, as defined in `ir-schema.md`. Every record is keyed by `__type`; field names, record types, error records and the end-of-stream marker are exactly those of `ir-schema.md`.

## Steps

Run the `ir-schema.md` procedure with these BPMN-specific rules:

1. **Step 0 (content check)** — evaluate element names, `<bpmn:documentation>` and `<bpmn:textAnnotation>` text against `guardrails.md`. Prohibited content → emit the single `content_warning` record and stop.
2. **Step 1 (diagram type)** — a file with at least one `<bpmn:process>` containing flow nodes is a `workflow`. No process → emit the `error` record with `check_id: "DIAGRAM_TYPE_VALIDATION"` and stop. The 10-activity complexity threshold does **not** apply to BPMN.
3. **Step 1.5 (metadata)** — emit `metadata` with `source: "bpmn"` and `process_id` set to the process `@id`.
4. **Steps 2A–2G** — map elements with the table below. Skip the `system` progress records (they add nothing for a deterministic parse).
5. **Step 3** — emit one `edge` per `<bpmn:sequenceFlow>`.
6. **Steps 4–6** — run the full validation (including `CONNECTIVITY` and `REACHABILITY`), then emit `result` and, on success, `end_of_ir_stream`. Validation failures produce `error` records + `result` with `success: false`, exactly as for images.

## Element → IR record mapping

| BPMN element | IR record | Notes |
|---|---|---|
| `<bpmn:process id="..." name="...">` | `metadata` | `name` = PascalCase of `@name` (fallback `@id`); `description` = `@name` or `<bpmn:documentation>`; `process_id` = `@id` |
| `<bpmn:participant>` inside `<bpmn:collaboration>` | `participant` | One per pool; `role` = `@name` |
| `<bpmn:lane>` | `participant` | One per lane; elements in the lane's `<bpmn:flowNodeRef>` list get `participant` = lane id |
| (no pools or lanes) | `participant` | Emit one `{"__type":"participant","id":"system","role":"System","confidence":"high"}` and assign it to every activity and gateway |
| `<bpmn:startEvent>` without an event definition | `start_end_node`, `type: "start"` | |
| `<bpmn:startEvent>` with a message / timer / signal definition | `activity`, `type: "wait_for_event"` | Per `ir-schema.md` Step 2B: one `events` entry for the trigger, `next` = target of its outgoing flow. No `start_end_node` for it. |
| `<bpmn:endEvent>` | `start_end_node`, `type: "end"` | |
| `<bpmn:endEvent>` with `<bpmn:errorEventDefinition>` | `start_end_node`, `type: "end_error"` | |
| `<bpmn:endEvent>` with `<bpmn:terminateEventDefinition>` | `start_end_node`, `type: "end_terminate"` | |
| `<bpmn:task>` | `activity`, `type: "task"`, `task_type: "standard_task"` | |
| `<bpmn:serviceTask>` | `activity`, `type: "task"`, `task_type: "service_task"` | |
| `<bpmn:userTask>` | `activity`, `type: "task"`, `task_type: "user_task"`, `asynchronous: true` | Human-in-the-loop |
| `<bpmn:manualTask>` | `activity`, `type: "task"`, `task_type: "manual_task"`, `asynchronous: true` | Human-in-the-loop |
| `<bpmn:scriptTask>` | `activity`, `type: "task"`, `task_type: "script_task"` | |
| `<bpmn:sendTask>` | `activity`, `type: "task"`, `task_type: "send_task"` | |
| `<bpmn:receiveTask>` | `activity`, `type: "task"`, `task_type: "receive_task"`, `asynchronous: true` | |
| `<bpmn:businessRuleTask>` | `activity`, `type: "task"`, `task_type: "business_rule_task"` | |
| `<bpmn:callActivity>` | `activity`, `type: "task"`, `task_type: "call_activity"` | Child workflow; put `@calledElement` in `description` |
| `<bpmn:subProcess>` | `activity`, `type: "task"`, `task_type: "call_activity"` | Child workflow; also emit an `unrecognized_item` (`category: "other"`, `ask_user: false`) summarising the nested body, which is generated as the child workflow |
| `<bpmn:exclusiveGateway>` | `gateway`, `type: "exclusive"` | |
| `<bpmn:parallelGateway>` | `gateway`, `type: "parallel"` | |
| `<bpmn:inclusiveGateway>` | `gateway`, `type: "inclusive"` | |
| `<bpmn:eventBasedGateway>` | `gateway`, `type: "event-based"` | The intermediate catch events that directly follow it become `flows` entries, not activities (Step 2B rule) |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:timerEventDefinition>` | `activity`, `type: "wait_for_event"`, `asynchronous: true` | One `events` entry: `event_type: "timer"`, `event_definition` = the `timeDuration` / `timeDate` / `timeCycle` text verbatim (ISO 8601 or cron) |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:messageEventDefinition>` | `activity`, `type: "wait_for_event"`, `asynchronous: true` | One `events` entry: `event_type: "message"`, `trigger_identifier` = the referenced message `@name` (fallback `messageRef`) |
| `<bpmn:intermediateCatchEvent>` with `<bpmn:signalEventDefinition>` | `activity`, `type: "wait_for_event"`, `asynchronous: true` | One `events` entry: `event_type: "signal"`, `trigger_identifier` = signal name |
| `<bpmn:intermediateThrowEvent>` with a message definition | `activity`, `type: "task"`, `task_type: "send_task"` | |
| `<bpmn:boundaryEvent>` | `failure_handling` | `associated_activity` = `@attachedToRef`; `handler_activity` = target of the boundary event's outgoing flow; `type` from its definition (`error_boundary_event`, `timer_boundary_event`, `message_boundary_event`, `signal_boundary_event`, `conditional_boundary_event`); `trigger` = `{ "error_code" }` / `{ "timer_definition" }` / `{ "message_name" }` / `{ "signal_name" }`. Do not emit an `edge` for the boundary event's outgoing flow. |
| `<bpmn:sequenceFlow>` | `edge` | `id` = `@id`; `from` = `@sourceRef`; `to` = `@targetRef`; `type: "synchronous"`; `gw_flow_condition` = `<bpmn:conditionExpression>` text (verbatim) or `@name` when the source is a diverging gateway; otherwise `visual_label` = `@name` |
| `<bpmn:dataObjectReference>` / `<bpmn:dataStoreReference>` | `data_object` | `implicit: false`; associations fill the owning activity's `data_objects_flow` (`dataInputAssociation` → `input`, `dataOutputAssociation` → `output`) |
| `<bpmn:messageFlow>` | *(no edge)* | Message flows cross pools and are not sequence flow. Make sure the source is a `send_task` (or throw event) and the target a `receive_task` / message wait, and emit an `unrecognized_item` with `category: "annotation"`, `ask_user: false` describing the flow |
| `<bpmn:textAnnotation>` | `unrecognized_item` | `category: "annotation"`, `ask_user: false` |

`wait_for_event` `events` entries need `name` (`@name`, fallback `@id`), a globally unique snake_case `event_label`, and `next` (the target of the element's outgoing sequence flow). Every `activity` also carries `participant`, `description` (`@name`), `data_objects_flow` (`[]` when none), `asynchronous` (`false` unless stated above), `multi_instance_type` (`null`), and `confidence: "high"`.

## Extraction rules

1. **IDs**: keep BPMN `@id` values verbatim as IR ids (an allowed exception to the snake_case rule in `ir-schema.md`). They are already unique within the document. Sequence flows without an `@id` produce edges without `id`.
2. **Descriptions**: prefer the `@name` attribute; fall back to `@id`.
3. **Gateway role**:
   - 1 incoming, > 1 outgoing → `diverging`
   - > 1 incoming, 1 outgoing → `converging` (`flows: []`)
   - Anything else → `dual`, plus an `unrecognized_item` with `category: "ambiguous_gateway_role"`, `ask_user: true`
4. **Gateway flows** (diverging `exclusive` / `inclusive`): one `flows` entry per outgoing sequence flow — `condition` = condition expression or flow `@name` (`null` if neither), `condition_label` = globally unique snake_case outcome (e.g. `in_stock`, `out_of_stock`), `is_default` = `true` only for the flow named by the gateway's `@default` attribute, `next` = `@targetRef`. A non-default flow with no condition → `unrecognized_item` `category: "gateway_condition"`.
5. **Event-based gateway flows**: one entry per following catch event — `name`, `event_type`, `trigger_identifier`, `event_definition`, and `next` = the target of that catch event's outgoing flow.
6. **Timers**: keep the ISO 8601 / cron expression verbatim in `event_definition`; the language prompts convert it.
7. **Collaboration**: if the file has `<bpmn:collaboration>` with several pools, emit one `metadata` record for the executable process (`isExecutable="true"`, or the first process), and model the other pools only through their message flows (send/receive tasks and `annotation` items). Ask the user which pool to generate when more than one is executable.
8. **Reachability**: an element that no sequence flow reaches (for example an end event with no incoming flow) is **not** dropped — it is emitted, and Step 4 reports it under `CONNECTIVITY` / `REACHABILITY`.

## Unsupported BPMN features

Emit an `unrecognized_item` with `category: "unsupported_element"` for each of the following. Do not drop them silently:

- `<bpmn:adHocSubProcess>`
- `<bpmn:transaction>`
- `<bpmn:complexGateway>`
- Multi-instance markers on tasks / sub-processes (`ask_user: false`; set `multi_instance_type` on the activity and treat it as single instance in v1)
- Compensation events and compensation handlers
- Escalation events

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
  <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="validate" />
  <bpmn:sequenceFlow id="f2" sourceRef="validate" targetRef="approved" />
  <bpmn:sequenceFlow id="toFulfill" sourceRef="approved" targetRef="fulfill">
    <bpmn:conditionExpression>${approved == true}</bpmn:conditionExpression>
  </bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="toReject" sourceRef="approved" targetRef="reject" />
  <bpmn:sequenceFlow id="f3" sourceRef="fulfill" targetRef="done" />
  <bpmn:sequenceFlow id="f4" sourceRef="reject" targetRef="done" />
</bpmn:process>
```

Expected IR:

```jsonl
{"__type":"metadata","schema_version":"1.0","source":"bpmn","process_id":"orderProcess","diagram_type":"workflow","complexity":"low","truncated":false,"name":"OrderProcess","description":"Order Process","feedback_required":false}
{"__type":"participant","id":"system","role":"System","confidence":"high"}
{"__type":"activity","id":"validate","type":"task","task_type":"standard_task","participant":"system","description":"Validate Order","data_objects_flow":[],"asynchronous":false,"multi_instance_type":null,"confidence":"high"}
{"__type":"activity","id":"fulfill","type":"task","task_type":"standard_task","participant":"system","description":"Fulfill","data_objects_flow":[],"asynchronous":false,"multi_instance_type":null,"confidence":"high"}
{"__type":"activity","id":"reject","type":"task","task_type":"standard_task","participant":"system","description":"Reject","data_objects_flow":[],"asynchronous":false,"multi_instance_type":null,"confidence":"high"}
{"__type":"gateway","id":"approved","type":"exclusive","role":"diverging","description":"Approved?","participant":"system","flows":[{"condition":"${approved == true}","condition_label":"order_approved","is_default":false,"next":"fulfill"},{"condition":null,"condition_label":"order_not_approved","is_default":true,"next":"reject"}],"data_objects_flow":[],"confidence":"high"}
{"__type":"start_end_node","id":"start","type":"start","description":"Order Received","confidence":"high"}
{"__type":"start_end_node","id":"done","type":"end","description":"done","confidence":"high"}
{"__type":"edge","id":"f1","from":"start","to":"validate","type":"synchronous","confidence":"high"}
{"__type":"edge","id":"f2","from":"validate","to":"approved","type":"synchronous","confidence":"high"}
{"__type":"edge","id":"toFulfill","from":"approved","to":"fulfill","type":"synchronous","gw_flow_condition":"${approved == true}","confidence":"high"}
{"__type":"edge","id":"toReject","from":"approved","to":"reject","type":"synchronous","confidence":"high"}
{"__type":"edge","id":"f3","from":"fulfill","to":"done","type":"synchronous","confidence":"high"}
{"__type":"edge","id":"f4","from":"reject","to":"done","type":"synchronous","confidence":"high"}
{"__type":"result","success":true,"failed_checks":[],"confidence":"high"}
{"__type":"end_of_ir_stream","__description":"End of JSON Lines IR output."}
```

A larger worked example — parallel split/join, a 7-day timer, a loop, and two reachable end events — is `../examples/order-process.bpmn` with its IR in `../examples/order-process.ir.jsonl`.

After the IR is emitted, proceed to Phase 2 (validate) and Phase 3 (code) exactly as for the image path.
