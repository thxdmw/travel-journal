package com.thx.traveljournal.journal.service;

import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
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
    private JournalMapper mapper;
    private JournalService service;

    @BeforeEach
    void setUp() {
        mapper = mock(JournalMapper.class);
        TripMapper tripMapper = mock(TripMapper.class);
        Trip trip = new Trip(); trip.setId(1L);
        when(tripMapper.selectById(1L)).thenReturn(trip);
        service = new JournalService(mapper, tripMapper, mock(TripStopMapper.class), mock(JournalMediaMapper.class));
    }

    @Test
    void newJournalShouldAlwaysBeDraft() {
        JournalEntry entry = validEntry();
        entry.setStatus("PUBLISHED");
        JournalEntry created = service.create(entry);
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getPublishedAt()).isNull();
        verify(mapper).insert(entry);
    }

    @Test
    void externalMarkdownImageShouldBeRejected() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("![外部图片](https://example.com/photo.jpg)");
        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("站内地址");
        verify(mapper, never()).insert(any(JournalEntry.class));
    }

    @Test
    void uploadedMarkdownImageShouldBeAccepted() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("![旅途](/api/media/42/display)");
        service.create(entry);
        verify(mapper).insert(entry);
    }

    @Test
    void externalHtmlImageShouldBeRejected() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("<figure><img src=\"https://example.com/photo.jpg\"></figure>");
        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("站内地址");
    }

    @Test
    void controlledHtmlImageShouldBeAccepted() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("<figure class=\"journal-figure journal-figure--medium\"><img src=\"/api/media/42/display\"></figure>");
        service.create(entry);
        verify(mapper).insert(entry);
    }

    @Test
    void multiImageGalleryBlockShouldBeAccepted() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("""
                <figure class="journal-gallery journal-gallery--grid journal-gallery--cols-3 journal-figure--large journal-figure--center">
                  <img src="/api/media/42/display" alt="第一张" loading="lazy">
                  <img src="/api/media/43/display" alt="第二张" loading="lazy">
                  <figcaption>清晨的老君阁</figcaption>
                </figure>""");
        service.create(entry);
        verify(mapper).insert(entry);
    }

    @Test
    void galleryWithExternalImageShouldStillBeRejected() {
        JournalEntry entry = validEntry();
        entry.setContentMarkdown("""
                <figure class="journal-gallery journal-gallery--row">
                  <img src="/api/media/42/display" alt="站内" loading="lazy">
                  <img src="https://example.com/photo.jpg" alt="外链" loading="lazy">
                </figure>""");
        assertThatThrownBy(() -> service.create(entry))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("站内地址");
        verify(mapper, never()).insert(any(JournalEntry.class));
    }

    @Test
    void blankContentCannotBePublished() {
        JournalEntry entry = validEntry();
        entry.setId(9L);
        entry.setContentMarkdown("");
        when(mapper.selectById(9L)).thenReturn(entry);
        assertThatThrownBy(() -> service.publish(9L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("正文");
    }

    private JournalEntry validEntry() {
        JournalEntry entry = new JournalEntry();
        entry.setTripId(1L);
        entry.setTitle("东京的春天");
        entry.setSlug("tokyo-spring");
        entry.setContentMarkdown("# 东京");
        entry.setOccurredOn(LocalDate.of(2026, 4, 12));
        return entry;
    }
}
