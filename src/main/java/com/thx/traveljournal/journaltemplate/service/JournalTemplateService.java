package com.thx.traveljournal.journaltemplate.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.service.JournalDocumentService;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.journaltemplate.mapper.JournalTemplateMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/** 模板是 Block 蓝图；生成以后，日记正文独立于模板继续编辑。 */
@Service
@RequiredArgsConstructor
public class JournalTemplateService {
    /**
     * 模板能选的区块 = 编辑器能加的区块。
     *
     * <p>直接复用正文那份白名单，不再自己维护第二份：以前这里只有 12 种，还有 text/textarea
     * 这两个编辑器里压根不存在的类型，于是「模板里加的区块」和「日记里加的区块」是两套名字、
     * 两套范围，作者每次都要重新对一遍。</p>
     */
    private static final Set<String> TYPES = JournalDocumentService.BLOCK_TYPES;
    /**
     * 已下线的模板专用类型 → 正文里对应的真实类型。
     *
     * <p>text（单行）和 textarea（多行）在正文里都是 paragraph，区别只是模板编辑器给的输入框
     * 高度不同——那是控件差异，不该变成一种区块类型。库里的老模板由 V31 迁移搬过一次，
     * 这里再兜一道：导入的模板 JSON 和旧客户端提交的定义都可能仍带着旧名字。</p>
     */
    private static final Map<String,String> LEGACY_TYPES = Map.of("text","paragraph","textarea","paragraph");
    /**
     * 从旅行工作台自动取数的区块。生成时对应数据为空就整块跳过，并在结果里报给作者。
     *
     * <p>trip-info 不在其中：它的日期和城市自动带出，天气和心情仍要作者填，
     * 没有「数据为空所以跳过」这回事。</p>
     */
    private static final Set<String> AUTO = Set.of("route","itinerary","expense-summary");
    /**
     * 生成日记时需要作者当场填内容的区块。其余类型一律生成空骨架，作者到编辑器里再填——
     * 模板负责的是「这篇日记由哪些块按什么顺序组成」，不必把 29 种区块的表单再实现一遍。
     */
    private static final Set<String> PROMPTED = Set.of("paragraph","heading","quote","rating",
            "checklist","image","gallery","postcard");
    private static final Set<String> SIZES = Set.of("small","medium","large","full");
    private static final Set<String> ALIGNS = Set.of("left","center","right");
    private static final Set<String> LAYOUTS = Set.of("row","grid","mosaic","carousel","filmstrip","compare");

    private final JournalTemplateMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final ItineraryMapper itineraryMapper;
    private final ExpenseMapper expenseMapper;
    private final BudgetCategoryMapper budgetMapper;
    private final MediaService mediaService;
    private final ObjectMapper objectMapper;
    private final JournalDocumentService documentService;

    public record TemplateInput(String name,String description,String category,JsonNode definitionJson,Boolean enabled){}
    public record GenerateInput(Long journalId,Long tripId,Long tripStopId,LocalDate occurredOn,JsonNode data){}
    public record GenerateResult(JsonNode contentJson,Long templateId,Integer templateVersion,List<String> skippedBlocks){}

    public List<JournalTemplate> list(boolean enabledOnly){
        return mapper.selectList(new LambdaQueryWrapper<JournalTemplate>()
                .eq(enabledOnly,JournalTemplate::getEnabled,true)
                .orderByDesc(JournalTemplate::getBuiltin).orderByDesc(JournalTemplate::getUpdatedAt));
    }
    public JournalTemplate get(Long id){
        JournalTemplate value=mapper.selectById(id);
        if(value==null) throw BusinessException.notFound("日记模板不存在");
        return value;
    }
    public JournalTemplate create(TemplateInput input){
        JournalTemplate value=new JournalTemplate(); copyInput(input,value);
        value.setVersion(1); value.setBuiltin(false); mapper.insert(value); return value;
    }
    public JournalTemplate update(Long id,TemplateInput input){
        JournalTemplate value=get(id);
        if(Boolean.TRUE.equals(value.getBuiltin())) throw BusinessException.conflict("系统模板不能直接修改，请先复制为我的模板");
        copyInput(input,value); value.setVersion(value.getVersion()+1); mapper.updateById(value); return value;
    }
    public void delete(Long id){
        JournalTemplate value=get(id);
        if(Boolean.TRUE.equals(value.getBuiltin())) throw BusinessException.conflict("系统模板不能删除");
        mapper.deleteById(id);
    }
    public JournalTemplate duplicate(Long id){
        JournalTemplate source=get(id),copy=new JournalTemplate();
        copy.setName(source.getName()+" 副本"); copy.setDescription(source.getDescription()); copy.setCategory("CUSTOM");
        copy.setDefinitionJson(source.getDefinitionJson().deepCopy()); copy.setVersion(1);
        copy.setEnabled(true); copy.setBuiltin(false); mapper.insert(copy); return copy;
    }

    @Transactional(readOnly=true)
    public GenerateResult generate(Long templateId,GenerateInput input){
        JournalTemplate template=get(templateId);
        if(!Boolean.TRUE.equals(template.getEnabled())) throw BusinessException.badRequest("该模板已停用");
        if(input.tripId()==null||input.occurredOn()==null) throw BusinessException.badRequest("请选择旅行和日记日期");
        Trip trip=tripMapper.selectById(input.tripId());
        if(trip==null) throw BusinessException.badRequest("所属旅行不存在");
        TripStop stop=selectedStop(input,trip);
        List<TripStop> stops=stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .eq(TripStop::getTripId,trip.getId()).orderByAsc(TripStop::getSortOrder,TripStop::getId));
        List<ItineraryItem> itinerary=itineraryMapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                .eq(ItineraryItem::getTripId,trip.getId()).eq(ItineraryItem::getItemDate,input.occurredOn())
                .orderByAsc(ItineraryItem::getStartTime,ItineraryItem::getSortOrder,ItineraryItem::getId));
        List<Expense> day=expenses(trip.getId(),input.occurredOn()), all=expenses(trip.getId(),null);
        Map<Long,String> categories=budgetMapper.selectList(new LambdaQueryWrapper<BudgetCategory>()
                .eq(BudgetCategory::getTripId,trip.getId())).stream()
                .collect(Collectors.toMap(BudgetCategory::getId,BudgetCategory::getName,(a,b)->a));
        Set<Long> media=input.journalId()==null?Set.of():mediaService.list(input.journalId()).stream()
                .map(MediaService.MediaView::id).collect(Collectors.toSet());
        ObjectNode values=input.data()!=null&&input.data().isObject()
                ?((ObjectNode)input.data()).deepCopy():objectMapper.createObjectNode();
        ArrayNode output=objectMapper.createArrayNode();
        List<String> skipped=new ArrayList<>();
        for(JsonNode definition:template.getDefinitionJson().path("blocks")){
            validateRequired(definition,values);
            ObjectNode block=generateBlock(definition,values,trip,stop,stops,itinerary,day,all,
                    categories,media,input.occurredOn());
            if(block!=null) output.add(block);
            else if(AUTO.contains(canonicalType(definition)))
                skipped.add(definition.path("title").asText(canonicalType(definition)));
        }
        ObjectNode document=documentService.emptyDocument(); document.set("blocks",output);
        return new GenerateResult(documentService.validate(document,false),template.getId(),template.getVersion(),skipped);
    }

    private TripStop selectedStop(GenerateInput input,Trip trip){
        if(input.tripStopId()==null) return null;
        TripStop stop=stopMapper.selectById(input.tripStopId());
        if(stop==null||!trip.getId().equals(stop.getTripId())) throw BusinessException.badRequest("城市不属于当前旅行");
        return stop;
    }
    private List<Expense> expenses(Long tripId,LocalDate date){
        LambdaQueryWrapper<Expense> q=new LambdaQueryWrapper<Expense>().eq(Expense::getTripId,tripId);
        if(date!=null) q.eq(Expense::getExpenseDate,date);
        return expenseMapper.selectList(q.orderByAsc(Expense::getExpenseDate,Expense::getId));
    }
    private ObjectNode generateBlock(JsonNode def,ObjectNode values,Trip trip,TripStop stop,
            List<TripStop> stops,List<ItineraryItem> itinerary,List<Expense> day,List<Expense> all,
            Map<Long,String> categories,Set<Long> media,LocalDate date){
        String type=canonicalType(def),title=def.path("title").asText("");
        JsonNode config=def.path("config"),raw=values.path(def.path("id").asText()),value=blockValue(raw);
        return switch(type){
            case "trip-info"->tripInfo(title,trip,stop,raw,date);
            case "route"->route(title,config,stops,itinerary);
            case "itinerary"->itinerary(title,itinerary);
            case "expense-summary"->expense(title,"trip".equals(config.path("source").asText())?all:day,
                    categories,trip.getDefaultCurrency());
            case "paragraph"->text("paragraph",title,value.asText(""));
            case "quote"->text("quote",title,value.asText(""));
            case "heading"->heading(value,config);
            // 分隔线没有内容也没有标题，是纯粹的排版符号
            case "divider"->block("divider","");
            case "rating"->rating(title,value,config.path("max").asInt(5));
            case "checklist"->checklist(title,value);
            case "image","gallery","postcard"->image(type,title,raw,config,media);
            /*
             * 其余类型生成一个空骨架。
             *
             * data 留空是有意的：前端 normalize()（frontend/src/journal/document.ts）会按
             * BLOCK_DEFAULTS 给每个类型建一份带默认字段的骨架再把已有 data 盖上去，所以这里
             * 吐 {} 出去，作者拿到的就是一块结构完整、内容待填的区块。后端因此不必再维护
             * 一份和 BLOCK_DEFAULTS 平行的默认值表——两份默认值迟早会对不上。
             */
            default->block(type,title);
        };
    }
    /** 区块类型，顺带把 text / textarea 这类下线名字搬成正文里的真实类型。 */
    private String canonicalType(JsonNode def){
        String type=def.path("type").asText("");
        return LEGACY_TYPES.getOrDefault(type,type);
    }
    private ObjectNode heading(JsonNode value,JsonNode config){
        String text=value.asText("");
        if(!StringUtils.hasText(text))return null;
        ObjectNode b=block("heading",""),d=(ObjectNode)b.path("data");
        d.put("text",text.trim());
        // 标题自己就是文字，再挂一个区块标题会连着出现两行；层级缺省用二级
        d.put("level",Math.max(2,Math.min(4,config.path("level").asInt(2))));
        return b;
    }
    private ObjectNode tripInfo(String title,Trip trip,TripStop stop,JsonNode raw,LocalDate date){
        ObjectNode b=block("trip-info",title),d=(ObjectNode)b.path("data");
        d.put("date",date.toString()); d.put("tripTitle",trip.getTitle());
        if(stop!=null)d.put("city",stop.getCityName());
        putText(d,"weather",raw.path("weather")); putText(d,"mood",raw.path("mood")); return b;
    }
    private ObjectNode route(String title,JsonNode config,List<TripStop> stops,List<ItineraryItem> itinerary){
        List<String> values="trip".equals(config.path("source").asText())
                ?stops.stream().map(TripStop::getCityName).filter(StringUtils::hasText).toList()
                :itinerary.stream().map(ItineraryItem::getTitle).filter(StringUtils::hasText).toList();
        if(values.isEmpty())return null;
        ObjectNode b=block("route",title); ArrayNode items=((ObjectNode)b.path("data")).putArray("items");
        values.forEach(items::add); return b;
    }
    private ObjectNode itinerary(String title,List<ItineraryItem> values){
        if(values.isEmpty())return null;
        ObjectNode b=block("itinerary",title); ArrayNode items=((ObjectNode)b.path("data")).putArray("items");
        DateTimeFormatter f=DateTimeFormatter.ofPattern("HH:mm");
        for(ItineraryItem value:values){
            ObjectNode item=items.addObject();
            if(value.getStartTime()!=null)item.put("time",value.getStartTime().format(f));
            item.put("title",value.getTitle());
            if(StringUtils.hasText(value.getAddress()))item.put("address",value.getAddress());
        } return b;
    }
    private ObjectNode expense(String title,List<Expense> values,Map<Long,String> names,String currency){
        if(values.isEmpty())return null;
        Map<String,BigDecimal> grouped=new LinkedHashMap<>();
        for(Expense value:values)grouped.merge(names.getOrDefault(value.getBudgetCategoryId(),"其他"),
                value.getAmount(),BigDecimal::add);
        ObjectNode b=block("expense-summary",title),d=(ObjectNode)b.path("data");
        d.put("currency",currency); d.put("total",grouped.values().stream().reduce(BigDecimal.ZERO,BigDecimal::add));
        ArrayNode items=d.putArray("categories");
        grouped.forEach((name,amount)->items.addObject().put("name",name).put("amount",amount)); return b;
    }
    private ObjectNode text(String type,String title,String value){
        if(!StringUtils.hasText(value))return null;
        ObjectNode b=block(type,title); ((ObjectNode)b.path("data")).put("text",value.trim()); return b;
    }
    private ObjectNode rating(String title,JsonNode value,int configuredMax){
        int max=Math.max(1,Math.min(10,configuredMax));
        int score=value.isObject()?value.path("value").asInt(value.path("score").asInt()):value.asInt();
        String comment=value.isObject()?value.path("comment").asText(""):"";
        if(score<=0&&!StringUtils.hasText(comment))return null;
        ObjectNode b=block("rating",title),d=(ObjectNode)b.path("data");
        d.put("score",Math.max(0,Math.min(max,score))); d.put("max",max);
        if(StringUtils.hasText(comment))d.put("comment",comment.trim()); return b;
    }
    private ObjectNode checklist(String title,JsonNode values){
        if(!values.isArray()||values.isEmpty())return null;
        ObjectNode b=block("checklist",title); ArrayNode items=((ObjectNode)b.path("data")).putArray("items");
        for(JsonNode value:values){
            String label=value.isTextual()?value.asText():value.path("text").asText("");
            if(StringUtils.hasText(label))items.addObject().put("text",label.trim())
                    .put("checked",value.isObject()&&value.path("checked").asBoolean());
        } return items.isEmpty()?null:b;
    }
    private ObjectNode image(String type,String title,JsonNode raw,JsonNode config,Set<Long> available){
        JsonNode source=raw.isObject()&&raw.has("mediaIds")?raw.path("mediaIds"):raw;
        List<Long> ids=new ArrayList<>();
        if(source.isArray()){
            for(JsonNode node:source){
                if(node.canConvertToLong())ids.add(node.asLong());
            }
        }
        else if(source.canConvertToLong())ids.add(source.asLong());
        // 单张图片和明信片都只放一张，多选时取第一张
        boolean single=!"gallery".equals(type);
        if(single&&ids.size()>1)ids.subList(1,ids.size()).clear();
        if(ids.isEmpty())return null;
        if(!available.containsAll(ids))throw BusinessException.badRequest("模板选择的图片不属于当前日记");
        ObjectNode b=block(type,title),d=(ObjectNode)b.path("data"),s=(ObjectNode)b.path("settings");
        if(single)d.put("mediaId",ids.get(0));
        else{
            ArrayNode mediaIds=d.putArray("mediaIds");
            for(Long id:ids)mediaIds.add(id);
        }
        s.put("size",allowed(config.path("imageSize").asText(),SIZES,"medium"));
        s.put("align",allowed(config.path("align").asText(),ALIGNS,"center"));
        // 明信片的版式是它自己那一种，不走图片组那套排布
        if("postcard".equals(type))s.put("layout","postcard");
        if("gallery".equals(type)){
            s.put("layout",allowed(config.path("layout").asText(),LAYOUTS,"grid"));
            s.put("columns",Math.max(1,Math.min(6,config.path("columns").asInt(3))));
        } return b;
    }
    private ObjectNode block(String type,String title){
        ObjectNode b=objectMapper.createObjectNode();
        b.put("id","block_"+UUID.randomUUID().toString().replace("-","").substring(0,12));
        b.put("type",type); b.put("version",1); if(StringUtils.hasText(title))b.put("title",title.trim());
        b.set("data",objectMapper.createObjectNode()); b.set("settings",objectMapper.createObjectNode()); return b;
    }
    private String allowed(String value,Set<String> allowed,String fallback){return allowed.contains(value)?value:fallback;}

    private void copyInput(TemplateInput input,JournalTemplate target){
        if(!StringUtils.hasText(input.name())||input.name().trim().length()>120)
            throw BusinessException.badRequest("模板名称不能为空且不能超过 120 个字符");
        if(StringUtils.hasText(input.description())&&input.description().length()>500)
            throw BusinessException.badRequest("模板说明不能超过 500 个字符");
        target.setName(input.name().trim());
        target.setDescription(StringUtils.hasText(input.description())?input.description().trim():null);
        target.setCategory(StringUtils.hasText(input.category())?input.category().trim().toUpperCase():"CUSTOM");
        target.setDefinitionJson(validateDefinition(input.definitionJson()));
        target.setEnabled(input.enabled()==null||input.enabled());
    }
    private JsonNode validateDefinition(JsonNode definition){
        if(definition==null||!definition.isObject()||!definition.path("blocks").isArray())
            throw BusinessException.badRequest("模板定义必须包含区块列表");
        ArrayNode blocks=(ArrayNode)definition.path("blocks");
        if(blocks.isEmpty()||blocks.size()>30)throw BusinessException.badRequest("模板需要 1 到 30 个区块");
        Set<String> ids=new HashSet<>();
        JsonNode result=definition.deepCopy();
        for(JsonNode block:result.path("blocks")){
            String id=block.path("id").asText(""),type=canonicalType(block);
            if(!id.matches("[A-Za-z][A-Za-z0-9_-]{0,39}")||!ids.add(id))
                throw BusinessException.badRequest("区块标识必须唯一，且只能包含字母、数字、下划线和短横线");
            if(!TYPES.contains(type))throw BusinessException.badRequest("不支持的区块类型："+type);
            if(block.path("title").asText("").length()>100)throw BusinessException.badRequest("区块标题不能超过 100 个字符");
            if(block.has("config")&&!block.path("config").isObject())throw BusinessException.badRequest("区块配置必须是对象");
            // 存进库的一律是正文里的真实类型，旧名字到此为止，不再往下游传
            ((ObjectNode)block).put("type",type);
        } return result;
    }
    private JsonNode blockValue(JsonNode raw){return raw.isObject()&&raw.has("value")?raw.path("value"):raw;}
    private void validateRequired(JsonNode def,ObjectNode values){
        if(!def.path("required").asBoolean())return;
        String type=canonicalType(def);
        // 只有「生成时填写」的区块才谈得上必填：自动取数的块没数据就跳过，
        // 空骨架的块本来就是留到编辑器里填的，在这里拦下来只会让人无从下手
        if(!PROMPTED.contains(type))return;
        JsonNode raw=values.path(def.path("id").asText()),value=blockValue(raw);
        boolean filled;
        if(Set.of("image","gallery","postcard").contains(type)){
            JsonNode ids=raw.isObject()?raw.path("mediaIds"):raw;
            filled=(ids.isArray()&&!ids.isEmpty())||ids.canConvertToLong();
        }else if("rating".equals(type))filled=value.asInt(value.path("value").asInt())>0;
        else if("checklist".equals(type))filled=value.isArray()&&!value.isEmpty();
        else filled=value.isTextual()&&StringUtils.hasText(value.asText());
        if(!filled)throw BusinessException.badRequest("请填写模板区块：“"+def.path("title").asText("未命名区块")+"”");
    }
    private void putText(ObjectNode target,String field,JsonNode value){
        if(value.isTextual()&&StringUtils.hasText(value.asText()))target.put(field,value.asText().trim());
    }
}
