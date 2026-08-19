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
import com.thx.traveljournal.common.util.SiteClock;

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
        // 带 CAS 条件的写回会检查影响行数；默认让它成功，需要模拟冲突的用例自己改成 0
        when(mapper.update(any(JournalEntry.class),any())).thenReturn(1);
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
        return capturedWrapper().getSqlSet();
    }

    private com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<JournalEntry> capturedWrapper(){
        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.Wrapper<JournalEntry>> captor=
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.Wrapper.class);
        verify(mapper).update(any(JournalEntry.class),captor.capture());
        return (com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<JournalEntry>)captor.getValue();
    }

    /** 本次写回的 WHERE 条件（列名和参数值）。 */
    private String capturedConditionSql(){
        var wrapper=capturedWrapper();
        String sql=wrapper.getSqlSegment();
        for(var entry:wrapper.getParamNameValuePairs().entrySet())
            sql=sql.replace("#{ew.paramNameValuePairs."+entry.getKey()+"}",String.valueOf(entry.getValue()));
        return sql;
    }

    /*
     * ============================================================ 并发协议
     *
     * 正文保存和状态转换必须用同一套并发控制。以前发布走的是不带任何条件的 updateById，
     * 既不看版本也不递增版本，于是一次晚到的自动保存能拿着「发布前」的版本号照样匹配成功，
     * 把刚发布的文章连同 published_at 一起写回草稿。
     */

    @Test
    void publishGuardsOnBothDraftStatusAndRevision(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(entry);

        service.publish(9L,10);

        String where=capturedConditionSql();
        assertThat(where).contains("status").contains("DRAFT").contains("revision").contains("10");
        // 状态转换也必须推进版本号，否则并发的自动保存拿着旧版本仍然能匹配上
        assertThat(capturedClearedColumns()).contains("revision = revision + 1");
    }

    @Test
    void guardedWriteAssignsRevisionExactlyOnce(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("DRAFT");
        // 发布传进来的实体是从库里读出来的，revision 带着值
        entry.setRevision(12);
        when(mapper.selectById(9L)).thenReturn(entry);

        service.publish(9L,12);

        /*
         * 实体上每个非 null 字段都会生成一列 SET。revision 要是留着值，一条 UPDATE 里就会
         * 同时出现 revision=? 和 revision = revision + 1，PostgreSQL 直接报
         * multiple assignments to same column —— 发布会 500。
         */
        ArgumentCaptor<JournalEntry> captor=ArgumentCaptor.forClass(JournalEntry.class);
        verify(mapper).update(captor.capture(),any());
        assertThat(captor.getValue().getRevision()).isNull();
        assertThat(capturedClearedColumns()).contains("revision = revision + 1");
    }

    @Test
    void publishOnAnAlreadyPublishedEntryConflictsInsteadOfOverwriting(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(entry);
        // 另一个请求先一步把它发布了：带 status='DRAFT' 的 UPDATE 匹配不到任何行
        when(mapper.update(any(JournalEntry.class),any())).thenReturn(0);

        assertThatThrownBy(()->service.publish(9L,10))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已经被改过");
    }

    @Test
    void draftSaveLosesToAConcurrentPublishInsteadOfRevertingIt(){
        JournalEntry stored=validEntry();stored.setId(9L);stored.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(stored);
        // 读到的还是 DRAFT，但真正 UPDATE 时那一行已经是 PUBLISHED 了
        when(mapper.update(any(JournalEntry.class),any())).thenReturn(0);
        JournalEntry input=new JournalEntry();input.setTitle("晚到的自动保存");

        assertThatThrownBy(()->service.updateDraft(9L,input,
                new JournalService.DraftPatch(java.util.Set.of("title"),false,10)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已经被改过");
        // 关键：不能把已发布的文章写回草稿
        assertThat(capturedConditionSql()).contains("status").contains("DRAFT");
    }

    @Test
    void unpublishRequiresPublishedStatusAndClearsPublishedAt(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("PUBLISHED");
        entry.setPublishedAt(OffsetDateTime.now(ZoneOffset.UTC));
        when(mapper.selectById(9L)).thenReturn(entry);

        service.unpublish(9L,7);

        assertThat(capturedConditionSql()).contains("status").contains("PUBLISHED").contains("7");
        assertThat(capturedClearedColumns()).contains("published_at");
    }

    @Test
    void statusIsGuardedEvenWhenTheClientSendsNoRevision(){
        JournalEntry entry=validEntry();entry.setId(9L);entry.setStatus("DRAFT");
        when(mapper.selectById(9L)).thenReturn(entry);

        service.publish(9L,null);

        // 老客户端不带版本号时，至少不能让状态已经变过的写入蒙混过关
        assertThat(capturedConditionSql()).contains("status").contains("DRAFT");
    }

    @Test
    void blankDocumentCannotBePublished(){
        JournalEntry entry=validEntry();entry.setId(9L);
        entry.setContentJson(new JournalDocumentService(objectMapper).emptyDocument());
        when(mapper.selectById(9L)).thenReturn(entry);
        assertThatThrownBy(()->service.publish(9L)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("内容区块");
    }

    /**
     * 草稿日期取的是站点时钟的今天，不是运行环境的今天。
     *
     * <p>这条断言原本写的是 {@code LocalDate.now()}，也就是 JVM 默认时区的今天。开发机在
     * 东八区，和站点时钟一致，所以一直是绿的；CI 容器跑在 UTC，于是每天 16:00 UTC 之后
     * 上海已经是第二天，这条用例就红一次——一个只在傍晚以后出现的失败。</p>
     *
     * <p>SiteClock 存在的意义正是「这个站点只有一个今天」，断言就该问它要。</p>
     */
    @Test
    void draftIsCreatedWithGeneratedSlugAndToday(){
        JournalEntry created=service.createDraft(1L,null,null);
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getTitle()).isEmpty();
        assertThat(created.getOccurredOn()).isEqualTo(new SiteClock(null).today());
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
        // 发布也走带条件的 UPDATE，不再是无条件 updateById
        verify(mapper).update(any(JournalEntry.class),any());
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
                .hasMessageContaining("已经被改过");
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
    void aDraftThatCameBackToLifeIsNotDeletedEvenThoughItWasACandidate(){
        // 扫描时是空的，但作者在这一轮循环里回来写了两段并保存了
        JournalEntry revived=emptyDraft(11L);
        revived.setTitle("刚写的标题");
        revived.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        when(mapper.selectOne(any())).thenReturn(revived);

        assertThat(service.deleteIfStillStaleEmpty(11L,OffsetDateTime.now(ZoneOffset.UTC).minusHours(24))).isFalse();
        verify(mapper,never()).deleteById(any(Long.class));
    }

    @Test
    void aStillEmptyDraftIsDeletedAfterTheRecheck(){
        JournalEntry stale=emptyDraft(11L);
        stale.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC).minusHours(30));
        when(mapper.selectOne(any())).thenReturn(stale);
        when(mapper.selectById(11L)).thenReturn(stale);
        when(mediaMapper.selectCount(any())).thenReturn(0L);

        assertThat(service.deleteIfStillStaleEmpty(11L,OffsetDateTime.now(ZoneOffset.UTC).minusHours(24))).isTrue();
        verify(mapper).deleteById(11L);
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
