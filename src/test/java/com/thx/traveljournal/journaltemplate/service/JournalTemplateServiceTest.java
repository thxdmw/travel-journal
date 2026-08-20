package com.thx.traveljournal.journaltemplate.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.service.JournalDocumentService;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.journaltemplate.mapper.JournalTemplateMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 模板的区块类型和「添加区块」目录是同一份清单，这里守住这件事。
 *
 * <p>以前模板自带一份 12 种的白名单，还有 text / textarea 这两个正文里根本不存在的类型；
 * 两边一分叉，作者在模板里看到的组件和在日记里看到的就对不上。</p>
 */
class JournalTemplateServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private JournalTemplateMapper mapper;
    private TripMapper tripMapper;
    private JournalTemplateService service;

    @BeforeEach
    void setUp() {
        mapper = mock(JournalTemplateMapper.class);
        tripMapper = mock(TripMapper.class);
        TripStopMapper stopMapper = mock(TripStopMapper.class);
        ItineraryMapper itineraryMapper = mock(ItineraryMapper.class);
        ExpenseMapper expenseMapper = mock(ExpenseMapper.class);
        BudgetCategoryMapper budgetMapper = mock(BudgetCategoryMapper.class);
        MediaService mediaService = mock(MediaService.class);
        when(stopMapper.selectList(any())).thenReturn(List.of());
        when(itineraryMapper.selectList(any())).thenReturn(List.of());
        when(expenseMapper.selectList(any())).thenReturn(List.of());
        when(budgetMapper.selectList(any())).thenReturn(List.of());
        service = new JournalTemplateService(mapper, tripMapper, stopMapper, itineraryMapper,
                expenseMapper, budgetMapper, mediaService, objectMapper,
                new JournalDocumentService(objectMapper));
    }

    /** 模板能选的区块必须覆盖正文支持的全部类型，一个都不少。 */
    @Test
    void everyContentBlockTypeShouldBeAcceptedInTemplates() {
        StringBuilder blocks = new StringBuilder();
        int index = 0;
        for (String type : JournalDocumentService.BLOCK_TYPES) {
            if (index++ > 0) blocks.append(',');
            blocks.append("{\"id\":\"b").append(index).append("\",\"type\":\"").append(type)
                    .append("\",\"title\":\"测试\",\"required\":false,\"config\":{}}");
        }
        JsonNode definition = read("{\"title\":\"全类型\",\"blocks\":[" + blocks + "]}");

        JournalTemplate saved = create(definition);

        assertThat(saved.getDefinitionJson().path("blocks"))
                .hasSize(JournalDocumentService.BLOCK_TYPES.size());
    }

    /** 已下线的 text / textarea 在存进库之前就搬成 paragraph，旧名字不再往下游传。 */
    @Test
    void retiredTemplateTypesShouldBeRewrittenToParagraph() {
        JsonNode definition = read("{\"title\":\"老模板\",\"blocks\":["
                + "{\"id\":\"a\",\"type\":\"text\",\"title\":\"标题句\",\"config\":{}},"
                + "{\"id\":\"b\",\"type\":\"textarea\",\"title\":\"正文\",\"config\":{}}]}");

        JournalTemplate saved = create(definition);

        assertThat(saved.getDefinitionJson().path("blocks")).allSatisfy(
                block -> assertThat(block.path("type").asText()).isEqualTo("paragraph"));
    }

    @Test
    void unknownTypeShouldStillBeRejected() {
        JsonNode definition = read("{\"title\":\"坏模板\",\"blocks\":[{\"id\":\"a\",\"type\":\"iframe\"}]}");

        assertThatThrownBy(() -> create(definition))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不支持的区块类型");
    }

    /**
     * 没有「生成时填写」表单的类型生成一块空骨架。
     *
     * <p>data 留空是有意的：前端 normalize() 会按 BLOCK_DEFAULTS 补出完整字段，
     * 所以后端不必再维护一份平行的默认值表。这里守住「块确实生成了、而且没被跳过」。</p>
     */
    @Test
    void skeletonTypesShouldBeGeneratedEmptyRatherThanSkipped() {
        JournalTemplate template = new JournalTemplate();
        template.setId(9L);
        template.setEnabled(true);
        template.setVersion(1);
        template.setDefinitionJson(read("{\"title\":\"骨架\",\"blocks\":["
                + "{\"id\":\"a\",\"type\":\"weather\",\"title\":\"今天的天气\",\"required\":true,\"config\":{}},"
                + "{\"id\":\"b\",\"type\":\"day-summary\",\"title\":\"今日小结\",\"config\":{}}]}"));
        when(mapper.selectById(9L)).thenReturn(template);
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setTitle("青城山一日游");
        trip.setDefaultCurrency("CNY");
        when(tripMapper.selectById(1L)).thenReturn(trip);

        JournalTemplateService.GenerateResult result = service.generate(9L,
                new JournalTemplateService.GenerateInput(null, 1L, null, LocalDate.of(2026, 8, 9), null));

        JsonNode blocks = result.contentJson().path("blocks");
        assertThat(blocks).hasSize(2);
        assertThat(blocks.get(0).path("type").asText()).isEqualTo("weather");
        assertThat(blocks.get(0).path("data")).isEmpty();
        assertThat(blocks.get(1).path("type").asText()).isEqualTo("day-summary");
        // required 对骨架块不生效：内容本来就是留到编辑器里填的，在这里拦下来只会让人无从下手
        assertThat(result.skippedBlocks()).isEmpty();
    }

    private JournalTemplate create(JsonNode definition) {
        return service.create(new JournalTemplateService.TemplateInput(
                "测试模板", "说明", "CUSTOM", definition, true));
    }

    private JsonNode read(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
