# Converting a Mermaid block

A Mermaid block has no arrangement to match: its positions are the layout
engine's output, not anybody's decision. What it gives you is the graph.

**First, decide whether it converts at all.** A flowchart that draws a
mechanism (participants, calls between them, a decision with outcomes)
converts. A sequence diagram stays Mermaid: this engine has no lifelines. Two
participants whose messages strictly alternate can be drawn as two columns
with horizontal runs read top to bottom, but five participants with looping
messages cannot. A gantt chart stays Mermaid. Tell the user which blocks you
will not convert and why.

1. **Read the graph, not the picture:** node ids and text, every edge with its
   label and direction, and the `subgraph` blocks. A subgraph is a lane:
   `flowLane()`.
2. **Take the axis from the declaration.** `flowchart LR` puts lanes side by
   side; `TD` stacks them. A subgraph's own `direction TB` means that lane runs
   down while the diagram runs across.
3. **Take the order from the surrounding text.** It outranks the Mermaid.
   Where the two disagree, ask the user.
4. **Map each node to the house shape for what it is,** not the bracket it was
   written in. A box labelled "Dapr sidecar" is `markHex()`.
5. **The house constraints apply, Mermaid's do not.** `decision()` holds one
   short word, with the condition above it as a `note()`.
