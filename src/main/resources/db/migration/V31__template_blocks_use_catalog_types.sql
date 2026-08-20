-- 日记模板的区块类型并入正文那一套。
--
-- 模板一直自带一份只有 12 种的白名单，里面还有 text / textarea 这两个正文里根本不存在的
-- 类型——它们在生成时都会变成 paragraph，区别只是模板编辑器给的输入框高一点。结果是
-- 「模板里能加的区块」和「日记里能加的区块」成了两套名字、两套范围，作者每次都要重新对。
--
-- 从这一版起模板直接复用 JournalDocumentService.BLOCK_TYPES（也就是前端 CATALOG 的 29 种），
-- text / textarea 就此下线，库里存量的两个名字在这里搬成 paragraph。
--
-- 只改 type 一个字段：config 里的 placeholder 对 paragraph 仍然有意义（生成时填写用的提示语），
-- 不需要动。搬完之后模板定义里出现的类型全都是正文里真实存在的类型。

update journal_template template
   set definition_json = migrated.definition_json,
       version = template.version + 1,
       updated_at = now()
  from (
    select t.id,
           jsonb_set(t.definition_json, '{blocks}', coalesce(jsonb_agg(
             case
               when b.block ->> 'type' in ('text', 'textarea')
                 then jsonb_set(b.block, '{type}', '"paragraph"'::jsonb)
               else b.block
             end order by b.ord), '[]'::jsonb)) as definition_json
      from journal_template t
      cross join lateral jsonb_array_elements(t.definition_json -> 'blocks') with ordinality as b(block, ord)
     where jsonb_typeof(t.definition_json -> 'blocks') = 'array'
     group by t.id, t.definition_json
  ) migrated
 where template.id = migrated.id
   and template.definition_json is distinct from migrated.definition_json;
