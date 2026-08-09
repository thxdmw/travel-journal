-- 开发期正文模型收口：Blocks JSON 是唯一事实源，不保留 Markdown 与模板运行态副本。
drop index if exists idx_journal_search_trgm;

alter table journal_entry drop column if exists search_text;

alter table journal_entry
    add column content_json jsonb not null
        default '{"schemaVersion":1,"blocks":[]}'::jsonb;

alter table journal_entry
    drop column content_markdown,
    drop column template_data,
    drop column template_snapshot,
    drop column template_detached;

alter table journal_entry
    add column search_text text
    generated always as (
        coalesce(title, '') || ' ' ||
        coalesce(excerpt, '') || ' ' ||
        coalesce(content_json::text, '')
    ) stored;

comment on column journal_entry.content_json is '日记 Block 文档，schemaVersion + blocks，是正文唯一事实源';
comment on column journal_entry.search_text is '标题、摘要与 Block JSON 拼接的检索文本，由数据库自动维护';

create index idx_journal_search_trgm on journal_entry using gin (search_text gin_trgm_ops)
    where status = 'PUBLISHED';
