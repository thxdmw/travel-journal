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
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JournalServiceTest {
    private final ObjectMapper objectMapper=new ObjectMapper();
    private JournalMapper mapper;
    private JournalMediaMapper mediaMapper;
    private JournalService service;

    @BeforeEach
    void setUp(){
        mapper=mock(JournalMapper.class);mediaMapper=mock(JournalMediaMapper.class);
        TripMapper tripMapper=mock(TripMapper.class);Trip trip=new Trip();trip.setId(1L);
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
        verify(mapper).updateById(any(JournalEntry.class));
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
        verify(mapper).updateById(input);
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
