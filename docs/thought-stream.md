# Thought Stream

I'm using this document to capture my thoughts as I evolve this system, both for some baseline level of documentation and as a scratch pad to validate ideas.

## Task Management

Current approach for task management has some problems, namely many assumptions on what will work in the future. Instead of trying to predict "the best possible game state action" autonomously, we should aim for a more player-controlled system driven through the nicer UX's we can spin up.
This has a few advantages:

- greatly simplifies upfront thinking required in understanding "what should be done", particularly because as a player I'm still learning
- minimizes assumptions that might be broken as new systems are unlocked later on
- we need more structured control over how tasks are assigned and where, particularly the ability to 'reserve' slots preventing the "growth" tasks from swalling up all capacity
- There's currently a gap in the system where if new servers are added, capacity is not re-assigned to growth tasks. Stopping/re-starting the dashboard "fixes" this by running a reassignment operation, but this should be more dynamic.

## Hacking Algorithms

Going overboard on an optimal hacking controller early game is an exercise in futility. The complexity of managing disparate hardware resources across an automated scheduler, without access to formulas APIs seems like an exercise in frustration AND futility. A best-effort system scattered across available nodes is good enough. Likely a better solution in later game is to get dedicated hardware to run these hacks on. Switching from a singular "highest value target" will be necessary later game as we'll have an abundance of resources and pointing them all at one server will be pointless (too many threads). As such, I want to defer the complexity of a more optimal system until later, since right now the system isn't hacking anything anyways. For the initial early game phase, I'll aim for a simple self-contained script that will be deployed on each available node, and that script's responsibility will be to hack its own node.

## Todos

- Put together a "contract solver" component, either using 2 pieces (solver and finder) to minimize early game ram usage, or combining them into one (more luxurious ram requirements, but simpler and avoids needing to use a port to communicate across the 2). The first might be preferable in practice, since we have plenty of available ports.
