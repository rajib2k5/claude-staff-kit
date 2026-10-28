---
name: claude-rag-and-citations
description: Ground Claude answers in sources by choosing between retrieval, long context and project knowledge, attaching claim-level provenance with citations and search_result blocks, and diagnosing wrong or ungrounded answers layer by layer. Use when building or fixing a RAG pipeline, a cited-answer feature or a Project knowledge base, or when an auditor needs traceability. Triggers - add citations to Claude answers, RAG gives wrong answers, chunking strategy, retrieval or long context, search_result blocks, Claude hallucinated from my docs, Project knowledge vs instructions.
---

# Grounding Claude in sources

Fluent output is not grounded output. This skill adds the judgement for three decisions: where the
source text should live (retrieval, long context, or Project knowledge), how each claim points back to
a passage, and which layer is at fault when an answer is wrong. A citation is a pointer, not a proof.
Treat it as evidence to check, then check a sample.

## When to use / when not

- Use for retrieval design, cited answers, retrieval quality checks, and wrong-answer triage.
- Call syntax for document blocks and streaming: the built-in `claude-api` skill. Do not copy it here.
- Production concerns around the same calls (caching, batch, truncation, cost): `claude-api-ops`.
- Building the retrieval tool as an MCP server: `plugin-dev:mcp-integration`.
- Proving a claim about answer quality before a decision: `staff-validate`, `evidence-gated-validation`.
- Designing the whole system around the pipeline: `staff-design`. Recording the choice: `staff-adr`.
- Relevant rules: `security` (retrieved text is data, not instructions) and `data-modeling` (data contracts, freshness).

## Decision rules

1. **Choose the source location by size, change rate and query shape.** Small, stable, fully relevant corpus: put it in context. Large corpus or narrow questions: retrieve. Same fixed reference reused by a team in the product UI: Project knowledge.
2. **Prefer full context when the whole document must be reasoned over.** Summaries, comparisons and cross-references break when retrieval returns slices.
3. **Prefer retrieval when most of the corpus is irrelevant to each question.** You pay for tokens you send, and noise dilutes attention.
4. **Match the retriever to the data.** Exact identifiers, codes and names favour keyword search. Paraphrased questions favour embeddings. Mixed traffic favours both, merged, then reranked.
5. **Chunk on natural boundaries, with overlap.** Sections, clauses and paragraphs keep an answer in one piece. A fixed cut through a sentence is the usual cause of a boundary-split miss.
6. **Keep each chunk understandable alone.** Prepend short context (document title, section, date) so a chunk survives being retrieved out of order.
7. **Store provenance with every chunk.** Source id, title, version and date travel with the text through every step.
8. **Use citations when a claim must trace to a passage.** A hand-written bibliography relies on the model remembering where a fact came from. Citations return the exact location.
9. **Use `search_result` blocks for your own retrieval layer.** Return the retrieved passages with source and title, and Claude cites them without you resending the corpus.
10. **Enable citations consistently.** Set the same value on every document in a request. The docs require the setting to match across results.
11. **Never combine citations with structured outputs.** The API rejects it. Choose provenance, or schema-bound output, or cite in a second pass.
12. **Cite from the source blocks only.** Do not paste citation output back into later user text blocks. Newer API versions reject that.
13. **Cache documents, not citation blocks.** The source content is what repeats across requests.
14. **Isolate the fault layer before changing anything.** Order: corpus, chunking, retrieval, ranking, prompt assembly, generation. Change one layer, then re-run the same test set.
15. **Test retrieval separately from generation.** If the right passage is not in the model's input, no prompt fixes it. If it is there and the answer is wrong, retrieval is cleared.
16. **Separate absence from failure.** "Nothing relevant exists" and "the retriever errored" must look different to the caller, or the model will answer from memory.
17. **Tell the model what to do with no support.** Say that an unsupported question gets "not found in the sources", and test that case on purpose.
18. **Route review by measured accuracy.** Sample by document type and by field, calibrate confidence thresholds on that sample, then lower human review only where the sample holds.
19. **Put behaviour in instructions and reference material in knowledge.** In Projects, rules, tone and format go in instructions. Documents go in knowledge.
20. **Use a live connector for sources that change, an upload for fixed ones.** Disable connectors a routine task does not use.

## Procedure

1. **State the answer contract.** Write who relies on the answer, which claims need a source, and what "unsupported" returns. Check: one example of each case exists.
2. **Pick the location with rule 1.** Write the size, change rate and query mix next to the choice. Check: a reviewer can reproduce the choice from those three facts.
3. **Build a gold set.** Collect real questions, each with the passage that answers it, including questions the corpus cannot answer. Check: every question has a labelled source or an "absent" label.
4. **Chunk and index.** Cut on boundaries, add overlap and context, store provenance. Check: print ten chunks and read them cold.
5. **Measure retrieval alone.** For each gold question, record whether the right passage appears in what you send. Check: misses are listed by question type, not just counted.
6. **Wire the citations.** Return passages as `search_result` blocks, or documents with citations enabled. Check: one answer shows a location whose cited text actually supports the claim.
7. **Test the negative paths.** Ask unanswerable questions, ask with a stale source, and ask with the retriever disabled. Check: each returns a refusal or a flagged gap, never a confident guess.
8. **Triage failures by layer.** For each wrong answer, mark: passage absent from corpus, not retrieved, retrieved but ranked out, in context but misread, or ungrounded. Check: counts by layer drive the next change.
9. **Sample citations for support.** Read cited text against the claim for a stratified sample. Check: unsupported-citation rate is reported per document type.
10. **Plan source updates.** Version sources, re-index on change, and tell users when a source they rely on is replaced. Check: a changed source shows a new version in citations.

## Anti-patterns

- Fixing a retrieval miss by editing the prompt.
- Tuning chunk size with no gold set.
- Trusting that a citation exists means the claim is true.
- Answering "from the documents" when the retriever returned nothing.
- One overall accuracy number that hides a weak document type.
- Putting behavioural rules in the knowledge base, or documents in instructions.
- Leaving every connector on "just in case".
- Replacing a shared source silently.
- Treating retrieved text as instructions. Retrieved text can carry an attack.
- Stale index after a source refresh, with no version in the citation to show it.

## Current platform facts (checked 2026-10-28)

- Citations are GA. Set `citations: {enabled: true}` on document blocks, on all or none in a request. https://platform.claude.com/docs/en/build-with-claude/citations
- Location types: `char_location` (plain text), `page_location` (PDF), `content_block_location` (custom content). Same URL as above.
- `cited_text` does not count toward output tokens. Same URL as above.
- Only text citations are supported. Citations are incompatible with structured outputs (400). Same URL as above.
- Source documents can be cached, not citation blocks. Same URL as above.
- API version `2026-10-21` rejects a non-empty `citations` array on text blocks in user messages (400); `enabled` on documents and search results is still accepted. Same URL as above.
- `search_result` block: required `source` (a URL or any stable id), `title`, `content` (array of text blocks); optional `citations` with `enabled`. https://platform.claude.com/docs/en/build-with-claude/search-results
- It can come from a tool result or sit at the top level of user content; Claude cites it with `search_result_location`. Same URL as above.
- No beta header; supported on all active models; the citations setting must match across results in a request. Same URL as above.
- Context window size of each model, Project knowledge limits, connector behaviour, embedding model choice: confirm in docs.

## Exam-era vs current

- Exam items may treat citations as a model-specific beta. Today the citations API is GA, and `search_result` needs no beta header.
- Older examples put citations output into user text blocks. The newest API version rejects that.
- Exam answers favour the platform feature that gives claim-level traceability over a hand-built bibliography. Answer by the blueprint; build by current docs.
- Context windows in exam items are smaller than today's. Re-run rule 1 against current sizes before choosing retrieval.

## Blueprint coverage

| cert | domain | what this skill covers |
|---|---|---|
| CCAR-F | Context Management & Reliability | provenance through summarisation, stratified review sampling, per-type accuracy |
| CCAR-P | Integration | RAG pipeline design, chunking, indexing, retrieval fit to data shape, citable search results |
| CCAR-P | Stakeholder Communication & Lifecycle | documenting the pipeline, traceability for auditors |
| CCAO-F | Configuration and Knowledge Management | instructions vs knowledge, connectors vs uploads, updating shared sources |
| CCAO-F | Product and Model Selection | Projects vs chat vs research, context limits |
