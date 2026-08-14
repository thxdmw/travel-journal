package com.thx.traveljournal.journal.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JournalServiceTest {
    private final ObjectMapper objectMapper=new ObjectMapper();
    private JournalMapper mapper;
    private JournalMediaMapper mediaMapper;
    private TripMapper tripMapper;
    private JournalService service;

    @BeforeEach
    void setUp(){
        mapper=mock(JournalMapper.class);mediaMapper=mock(JournalMediaMapper.class);
        tripMapper=mock(TripMapper.class);Trip trip=new Trip();trip.setId(1L);
        when(tripMapper.selectById(1L)).thenReturn(trip);
        service=new JournalService(mapper,tripMapper,mock(TripStopMapper.class),mediaMapper);
    }

    @Test
    void newJournalShouldAlwaysBeDraft(){
        JournalEntry entry=validEntry();entry.setStatus("PUBLISHED");
        JournalEntry created=service.create(entry);
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getPublishedAt()).isNull();
        verify(mapper).insert(entry);
    }

    @Test
    void unknownBlockTypeShouldBeRejected(){
        JournalEntry entry=validEntry();
        ObjectNode block=(ObjectNode)entry.getContentJson().path("blocks").get(0);
        block.put("type","raw-html");
        assertThatThrownBy(()->service.create(entry)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("区块");
        verify(mapper,never()).insert(any(JournalEntry.class));
    }

    @Test
    void mediaBlockCannotBeAddedBeforeDraftHasAnId(){
        JournalEntry entry=validEntry();
        ObjectNode block=objectMapper.createObjectNode();
        block.put("id","block_image_01");block.put("type","image");block.put("version",1);
        block.putObject("data").put("mediaId",42L);block.putObject("settings");
        ((ObjectNode)entry.getContentJson()).withArray("blocks").add(block);
        assertThatThrownBy(()->service.create(entry)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("先保存草稿");
    }

    @Test
    void attachedMediaBlockShouldBeAcceptedOnUpdate(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("DRAFT");
        ObjectNode block=objectMapper.createObjectNode();
        block.put("id","block_image_01");block.put("type","image");block.put("version",1);
        block.putObject("data").put("mediaId",42L);block.putObject("settings");
        ((ObjectNode)entry.getContentJson()).withArray("blocks").add(block);
        when(mapper.selectById(9L)).thenReturn(entry);
        when(mediaMapper.selectCount(any())).thenReturn(1L);
        service.update(9L,entry);
        verify(mapper).update(any(JournalEntry.class),any());
    }

    @Test
    void fullUpdateClearsOptionalFieldsThatWereLeftOut(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setTripId(1L);
        stored.setTripStopId(3L);stored.setCoverMediaId(7L);stored.setExcerpt("旧摘要");
        when(mapper.selectById(9L)).thenReturn(stored);
        JournalEntry input=validEntry();input.setTripId(null);input.setTripStopId(null);
        input.setCoverMediaId(null);input.setExcerpt(null);

        service.update(9L,input);

        // 默认更新策略会跳过 null，这些列必须显式写成 NULL，否则界面上清空了、库里还留着
        assertThat(capturedClearedColumns()).contains("trip_id","trip_stop_id","cover_media_id","excerpt");
    }

    @Test
    void draftPatchKeepsAbsentFieldsButClearsExplicitNulls(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");
        stored.setCoverMediaId(7L);stored.setExcerpt("旧摘要");stored.setThemeKey("sakura");
        when(mapper.selectById(9L)).thenReturn(stored);
        JournalEntry input=new JournalEntry();input.setTitle("改了标题");
        // 请求只提到了标题和封面：封面显式清空，摘要和主题没提到就该原样留着
        service.updateDraft(9L,input,new JournalService.DraftPatch(java.util.Set.of("title","coverMediaId"),false));

        assertThat(capturedClearedColumns()).contains("cover_media_id").doesNotContain("excerpt");
        assertThat(input.getExcerpt()).isEqualTo("旧摘要");
        assertThat(input.getThemeKey()).isEqualTo("sakura");
    }

    @Test
    void switchingTripDropsTheStopThatBelongedToTheOldTrip(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");
        stored.setTripId(1L);stored.setTripStopId(3L);
        when(mapper.selectById(9L)).thenReturn(stored);
        JournalEntry input=new JournalEntry();input.setTripId(2L);
        Trip other=new Trip();other.setId(2L);
        when(tripMapper.selectById(2L)).thenReturn(other);

        service.updateDraft(9L,input,new JournalService.DraftPatch(java.util.Set.of("tripId"),false));

        // 旧城市属于上一场旅行，留下来就是一条「城市不属于当前旅行」的脏数据
        assertThat(input.getTripStopId()).isNull();
        assertThat(capturedClearedColumns()).contains("trip_stop_id");
    }

    /** 本次写回真正被 set 成 NULL 的列。 */
    private String capturedClearedColumns(){
        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.Wrapper<JournalEntry>> captor=
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.Wrapper.class);
        verify(mapper).update(any(JournalEntry.class),captor.capture());
        return ((com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<JournalEntry>)captor.getValue()).getSqlSet();
    }

    @Test
    void blankDocumentCannotBePublished(){
        JournalEntry entry=validEntry();entry.setId(9L);
        entry.setContentJson(new JournalDocumentService(objectMapper).emptyDocument());
        when(mapper.selectById(9L)).thenReturn(entry);
        assertThatThrownBy(()->service.publish(9L)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("内容区块");
    }

    @Test
    void draftIsCreatedWithGeneratedSlugAndToday(){
        JournalEntry created=service.createDraft(1L,null,null);
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getTitle()).isEmpty();
        assertThat(created.getOccurredOn()).isEqualTo(LocalDate.now());
        assertThat(created.getSlug()).startsWith("journal-").matches("^[a-z0-9]+(?:-[a-z0-9]+)*$");
        assertThat(created.getContentJson().path("blocks")).isEmpty();
        verify(mapper).insert(created);
    }

    @Test
    void standaloneDraftCanBeCreatedWithoutTrip(){
        JournalEntry created=service.createDraft(null,null,LocalDate.of(2026,8,11));

        assertThat(created.getTripId()).isNull();
        assertThat(created.getTripStopId()).isNull();
        assertThat(created.getOccurredOn()).isEqualTo(LocalDate.of(2026,8,11));
        verify(mapper).insert(created);
    }

    @Test
    void standaloneDraftCannotKeepATripStop(){
        assertThatThrownBy(()->service.createDraft(null,8L,LocalDate.of(2026,8,11)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不能选择所属城市");
        verify(mapper,never()).insert(any(JournalEntry.class));
    }

    @Test
    void generatedDraftSlugsDoNotCollide(){
        assertThat(service.createDraft(1L,null,LocalDate.of(2026,8,10)).getSlug())
                .isNotEqualTo(service.createDraft(1L,null,LocalDate.of(2026,8,10)).getSlug());
    }

    @Test
    void draftSaveAcceptsBlankTitleAndEmptyBody(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(stored);
        JournalEntry input=new JournalEntry();
        input.setTripId(1L);input.setTitle("");
        input.setContentJson(new JournalDocumentService(objectMapper).emptyDocument());
        service.updateDraft(9L,input);
        assertThat(input.getSlug()).isEqualTo("tokyo-spring");
        verify(mapper).update(eq(input),any());
    }

    @Test
    void draftCanExplicitlyDetachFromTrip(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(stored);
        JournalEntry input=validEntry();

        service.updateDraft(9L,input,true);

        assertThat(input.getTripId()).isNull();
        assertThat(input.getTripStopId()).isNull();
        // 解除归属必须真的写成 NULL：只把字段 set 成 null 的话这一列会被更新策略跳过
        assertThat(capturedClearedColumns()).contains("trip_id","trip_stop_id");
    }

    @Test
    void blankTitleCannotBePublished(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setTitle("");
        when(mapper.selectById(9L)).thenReturn(entry);
        assertThatThrownBy(()->service.publish(9L)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("标题");
        verify(mapper,never()).updateById(any(JournalEntry.class));
    }

    @Test
    void standaloneJournalCanBePublished(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setTripId(null);
        when(mapper.selectById(9L)).thenReturn(entry);

        JournalEntry published=service.publish(9L);

        assertThat(published.getStatus()).isEqualTo("PUBLISHED");
        assertThat(published.getTripId()).isNull();
        verify(mapper).updateById(entry);
    }

    @Test
    void publishedJournalRejectsDraftAutoSave(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("PUBLISHED");
        when(mapper.selectById(9L)).thenReturn(entry);
        assertThatThrownBy(()->service.updateDraft(9L,validEntry())).isInstanceOf(BusinessException.class)
                .hasMessageContaining("更新发布");
    }

    @Test
    void emptyDraftIsDiscarded(){
        JournalEntry entry=new JournalEntry();
        entry.setId(9L);entry.setTripId(1L);entry.setTitle("");entry.setStatus("DRAFT");
        entry.setContentJson(new JournalDocumentService(objectMapper).emptyDocument());
        when(mapper.selectById(9L)).thenReturn(entry);
        when(mediaMapper.selectCount(any())).thenReturn(0L);
        assertThat(service.discardIfEmpty(9L)).isTrue();
        verify(mapper).deleteById(9L);
    }

    @Test
    void draftWithContentIsKept(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setTitle("");entry.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(entry);
        when(mediaMapper.selectCount(any())).thenReturn(0L);
        assertThat(service.discardIfEmpty(9L)).isFalse();
        verify(mapper,never()).deleteById(any(Long.class));
    }

    @Test
    void staleSaveIsRejectedInsteadOfOverwritingNewerContent(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");stored.setRevision(4);
        when(mapper.selectById(9L)).thenReturn(stored);
        // 带条件的 UPDATE 一行都没改到，说明版本已经被别处推进了
        when(mapper.update(any(JournalEntry.class),any())).thenReturn(0);
        JournalEntry input=new JournalEntry();input.setTitle("晚到的旧正文");

        assertThatThrownBy(()->service.updateDraft(9L,input,
                new JournalService.DraftPatch(java.util.Set.of("title"),false,4)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("更新的版本");
    }

    @Test
    void savingWithTheCurrentRevisionSucceedsAndBumpsIt(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");stored.setRevision(4);
        when(mapper.selectById(9L)).thenReturn(stored);
        when(mapper.update(any(JournalEntry.class),any())).thenReturn(1);
        JournalEntry input=new JournalEntry();input.setTitle("新写的一段");

        service.updateDraft(9L,input,new JournalService.DraftPatch(java.util.Set.of("title"),false,4));

        assertThat(capturedClearedColumns()).isNotNull();
    }

    @Test
    void purgeDeadlineIsRollingTwentyFourHoursInUtc(){
        OffsetDateTime deadline=JournalService.purgeDeadline(Duration.ofHours(24));

        // 滚动 24 小时，不是「今天之前」，也不是站点自然日零点
        assertThat(deadline).isCloseTo(OffsetDateTime.now(ZoneOffset.UTC).minusHours(24),
                within(1,ChronoUnit.MINUTES));
        assertThat(JournalService.purgeDeadline(Duration.ofHours(48))).isBefore(deadline);
    }

    @Test
    void staleEmptyDraftIsCollectedButOnesWithContentAreKept(){
        JournalEntry empty=emptyDraft(11L);
        JournalEntry titled=emptyDraft(12L);titled.setTitle("写了标题");
        JournalEntry withCover=emptyDraft(13L);withCover.setCoverMediaId(4L);
        JournalEntry withBody=validEntry();withBody.setId(14L);withBody.setTitle("");withBody.setStatus("DRAFT");
        when(mapper.selectList(any())).thenReturn(java.util.List.of(empty,titled,withCover,withBody));
        when(mediaMapper.selectList(any())).thenReturn(java.util.List.of());

        assertThat(service.staleEmptyDraftIds(Duration.ofHours(24))).containsExactly(11L);
    }

    @Test
    void draftWithPhotosIsKeptEvenWhenAllTextIsBlank(){
        JournalEntry empty=emptyDraft(11L);
        JournalEntry photographed=emptyDraft(12L);
        JournalMedia relation=new JournalMedia();relation.setJournalEntryId(12L);
        when(mapper.selectList(any())).thenReturn(java.util.List.of(empty,photographed));
        when(mediaMapper.selectList(any())).thenReturn(java.util.List.of(relation));

        assertThat(service.staleEmptyDraftIds(Duration.ofHours(24))).containsExactly(11L);
        // 图片只问一次，不按草稿篇数发查询
        verify(mediaMapper,times(1)).selectList(any());
    }

    @Test
    void publishedEntriesAreNeverCollected(){
        JournalEntry published=emptyDraft(11L);published.setStatus("PUBLISHED");
        when(mapper.selectList(any())).thenReturn(java.util.List.of(published));

        assertThat(service.staleEmptyDraftIds(Duration.ofHours(24))).isEmpty();
    }

    /** 一篇标题、摘要、正文、封面、图片全空的草稿。 */
    private JournalEntry emptyDraft(long id){
        JournalEntry entry=new JournalEntry();
        entry.setId(id);entry.setStatus("DRAFT");entry.setTitle("");
        entry.setContentJson(new JournalDocumentService(objectMapper).emptyDocument());
        return entry;
    }

    private JournalEntry validEntry(){
        JournalEntry entry=new JournalEntry();
        entry.setTripId(1L);entry.setTitle("东京的春天");entry.setSlug("tokyo-spring");
        ObjectNode document=new JournalDocumentService(objectMapper).emptyDocument();
        ObjectNode block=objectMapper.createObjectNode();
        block.put("id","block_text_001");block.put("type","paragraph");block.put("version",1);
        block.putObject("data").put("text","东京");block.putObject("settings");
        document.withArray("blocks").add(block);entry.setContentJson(document);
        entry.setOccurredOn(LocalDate.of(2026,4,12));return entry;
    }
}
