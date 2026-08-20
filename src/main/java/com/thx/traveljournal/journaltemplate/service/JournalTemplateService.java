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
    private static final Set<String> TYPES = Set.of("trip-info","text","textarea","quote","rating",
            "checklist","route","itinerary","expense-summary","image","gallery","divider");
    private static final Set<String> AUTO = Set.of("route","itinerary","expense-summary");
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
            else if(AUTO.contains(definition.path("type").asText()))
                skipped.add(definition.path("title").asText(definition.path("type").asText()));
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
        String type=def.path("type").asText(),title=def.path("title").asText("");
        JsonNode config=def.path("config"),raw=values.path(def.path("id").asText()),value=blockValue(raw);
        return switch(type){
            case "trip-info"->tripInfo(title,trip,stop,raw,date);
            case "route"->route(title,config,stops,itinerary);
            case "itinerary"->itinerary(title,itinerary);
            case "expense-summary"->expense(title,"trip".equals(config.path("source").asText())?all:day,
                    categories,trip.getDefaultCurrency());
            case "text","textarea"->text("paragraph",title,value.asText(""));
            case "quote"->text("quote",title,value.asText(""));
            case "rating"->rating(title,value,config.path("max").asInt(5));
            case "checklist"->checklist(title,value);
            case "image","gallery"->image(type,title,raw,config,media);
            case "divider"->block("divider","");
            default->null;
        };
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
        if("image".equals(type)&&ids.size()>1)ids.subList(1,ids.size()).clear();
        if(ids.isEmpty())return null;
        if(!available.containsAll(ids))throw BusinessException.badRequest("模板选择的图片不属于当前日记");
        ObjectNode b=block(type,title),d=(ObjectNode)b.path("data"),s=(ObjectNode)b.path("settings");
        if("image".equals(type))d.put("mediaId",ids.get(0));
        else{
            ArrayNode mediaIds=d.putArray("mediaIds");
            for(Long id:ids)mediaIds.add(id);
        }
        s.put("size",allowed(config.path("imageSize").asText(),SIZES,"medium"));
        s.put("align",allowed(config.path("align").asText(),ALIGNS,"center"));
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
        for(JsonNode block:blocks){
            String id=block.path("id").asText(""),type=block.path("type").asText("");
            if(!id.matches("[A-Za-z][A-Za-z0-9_-]{0,39}")||!ids.add(id))
                throw BusinessException.badRequest("区块标识必须唯一，且只能包含字母、数字、下划线和短横线");
            if(!TYPES.contains(type))throw BusinessException.badRequest("不支持的区块类型："+type);
            if(block.path("title").asText("").length()>100)throw BusinessException.badRequest("区块标题不能超过 100 个字符");
            if(block.has("config")&&!block.path("config").isObject())throw BusinessException.badRequest("区块配置必须是对象");
        } return definition.deepCopy();
    }
    private JsonNode blockValue(JsonNode raw){return raw.isObject()&&raw.has("value")?raw.path("value"):raw;}
    private void validateRequired(JsonNode def,ObjectNode values){
        if(!def.path("required").asBoolean())return;
        String type=def.path("type").asText();
        if(Set.of("trip-info","route","itinerary","expense-summary","divider").contains(type))return;
        JsonNode raw=values.path(def.path("id").asText()),value=blockValue(raw);
        boolean filled;
        if(Set.of("image","gallery").contains(type)){
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
