# Agent instructions

Scope and precedence: the constitution contains repository-wide architecture invariants. Deeper
instructions may narrow scope but not override them. Use only documented tools with least privilege;
tool failure must stop safely and any fallback needs human approval and audit evidence.

Every task has acceptance criteria, a data classification, allowed tools and mutations, a time and
cost budget, a responsible human, and a stop condition. Work is isolated. Human review and approval
are required before merge. The recovery owner uses the kill switch and rollback runbook.

Corrections enter the lessons log. A release curation process promotes durable lessons, identifies
stale or contradictory knowledge, and assigns an owner.
