(function () {
  const http = axios.create({
    baseURL: '/api',
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN',
    timeout: 30000
  });

  http.interceptors.response.use(
    response => response.data && Object.prototype.hasOwnProperty.call(response.data, 'data')
      ? response.data.data : response.data,
    error => {
      const response = error.response;
      const message = response && response.data && response.data.message
        ? response.data.message : '网络请求失败';
      if (response && response.status === 401 && location.pathname.startsWith('/admin')
          && !location.hash.includes('/login')) {
        location.hash = '#/login';
      }
      return Promise.reject(new Error(message));
    }
  );

  async function ensureCsrf() {
    return http.get('/public/csrf');
  }

  window.TravelApi = {
    http,
    ensureCsrf,
    public: {
      home: () => http.get('/public/home'),
      trips: () => http.get('/public/trips'),
      trip: slug => http.get('/public/trips/' + encodeURIComponent(slug)),
      journals: (page = 1, pageSize = 12, keyword, tag) =>
        http.get('/public/journals', { params: { page, pageSize, keyword, tag } }),
      tags: () => http.get('/public/tags'),
      years: () => http.get('/public/years'),
      yearReview: year => http.get('/public/years/' + year),
      journal: slug => http.get('/public/journals/' + encodeURIComponent(slug)),
      preview: token => http.get('/public/preview/' + encodeURIComponent(token)),
      cities: () => http.get('/public/map/cities'),
      profile: () => http.get('/public/profile', { params: { v: Date.now() } })
    },
    auth: {
      login: body => http.post('/admin/auth/login', body),
      logout: () => http.post('/admin/auth/logout'),
      session: () => http.get('/admin/auth/session'),
      me: () => http.get('/admin/auth/me'),
      changePassword: body => http.post('/admin/auth/change-password', body),
      uploadAvatar: form => http.post('/admin/profile/avatar', form),
      updateDisplayName: body => http.put('/admin/profile/display-name', body),
      // mode 传 'AUTO' 表示跟随季节，此时 themeKey 可以为空；不传就是锁定这一套
      changeTheme: (themeKey, mode) => http.put('/admin/profile/theme', { themeKey, mode })
    },
    admin: {
      trips: params => http.get('/admin/trips', { params }),
      trip: id => http.get('/admin/trips/' + id),
      createTrip: body => http.post('/admin/trips', body),
      updateTrip: (id, body) => http.put('/admin/trips/' + id, body),
      dashboard: id => http.get('/admin/trips/' + id + '/dashboard'),
      uploadTripCover: (id, form) => http.post('/admin/trips/' + id + '/cover', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }),
      clearTripCover: id => http.delete('/admin/trips/' + id + '/cover'),
      stops: id => http.get('/admin/trips/' + id + '/stops'),
      createStop: (id, body) => http.post('/admin/trips/' + id + '/stops', body),
      updateStop: (id, body) => http.put('/admin/stops/' + id, body),
      deleteStop: id => http.delete('/admin/stops/' + id),
      mapStatus: () => http.get('/admin/map/status'),
      searchLocations: (keyword, region) => http.get('/admin/map/search', { params: { keyword, region } }),
      reverseLocation: (latitude, longitude) => http.get('/admin/map/reverse', { params: { latitude, longitude } }),
      itinerary: id => http.get('/admin/trips/' + id + '/itinerary'),
      createItinerary: (id, body) => http.post('/admin/trips/' + id + '/itinerary', body),
      updateItinerary: (id, body) => http.put('/admin/itinerary/' + id, body),
      deleteItinerary: id => http.delete('/admin/itinerary/' + id),
      completeItinerary: (id, completed) => http.patch('/admin/itinerary/' + id + '/completed', { completed }),
      budget: id => http.get('/admin/trips/' + id + '/budget'),
      createCategory: (id, body) => http.post('/admin/trips/' + id + '/budget-categories', body),
      updateCategory: (id, body) => http.put('/admin/budget-categories/' + id, body),
      deleteCategory: id => http.delete('/admin/budget-categories/' + id),
      expenses: id => http.get('/admin/trips/' + id + '/expenses'),
      createExpense: (id, body) => http.post('/admin/trips/' + id + '/expenses', body),
      updateExpense: (id, body) => http.put('/admin/expenses/' + id, body),
      deleteExpense: id => http.delete('/admin/expenses/' + id),
      journals: params => http.get('/admin/journals', { params }),
      journal: id => http.get('/admin/journals/' + id),
      createJournal: body => http.post('/admin/journals', body),
      updateJournal: (id, body) => http.put('/admin/journals/' + id, body),
      // 开一篇空草稿，编辑器一进页面就调，好让打字和拍照立刻有 id 可用
      createJournalDraft: body => http.post('/admin/journals/draft', body || {}),
      // 草稿自动保存：字段可以不全，后端按草稿标准校验（允许空标题、空正文）
      saveJournalDraft: (id, body) => http.patch('/admin/journals/' + id + '/draft', body),
      // 作者显式放弃一篇空草稿时调用，是否真的删由后端判断。
      // 退出编辑器时不再自动调它——那一刻最后一次保存可能还在路上，看着空的未必真是空的；
      // 真正没人动过的空草稿由服务端满 24 小时后统一回收。
      discardEmptyJournal: id => http.delete('/admin/journals/' + id + '/discard-empty'),
      deleteJournal: id => http.delete('/admin/journals/' + id),
      journalMediaCount: id => http.get('/admin/journals/' + id + '/media-count'),
      publishJournal: id => http.post('/admin/journals/' + id + '/publish'),
      unpublishJournal: id => http.post('/admin/journals/' + id + '/unpublish'),
      media: id => http.get('/admin/journals/' + id + '/media'),
      // onUploadProgress 用来在正文的占位图上显示单张进度；旅行时一次传十几张，
      // 没有进度就只剩一个转圈，分不清是卡住了还是在传
      uploadMedia: (id, form, onUploadProgress) => http.post('/admin/journals/' + id + '/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000, onUploadProgress
      }),
      sortMediaByCaptureTime: journalId => http.put('/admin/journals/' + journalId + '/media/sort-by-capture-time'),
      suggestCity: journalId => http.get('/admin/journals/' + journalId + '/media/suggest-city'),
      createPreviewLink: journalId => http.post('/admin/journals/' + journalId + '/preview-link'),
      revokePreviewLink: journalId => http.delete('/admin/journals/' + journalId + '/preview-link'),
      journalTags: () => http.get('/admin/journals/tags'),
      renameTag: (tagId, name) => http.put('/admin/journals/tags/' + tagId, { name }),
      mergeTag: (sourceId, targetId) => http.post('/admin/journals/tags/' + sourceId + '/merge-into/' + targetId),
      deleteTag: tagId => http.delete('/admin/journals/tags/' + tagId),
      purgeUnusedTags: () => http.post('/admin/journals/tags/purge-unused'),
      setCover: (journalId, mediaId) => http.patch('/admin/journals/' + journalId + '/cover/' + mediaId),
      // orderedIds 传的是 journal_media 关系 id，且必须是该日记的全部图片，少一张后端就 400
      reorderMedia: (journalId, orderedIds) => http.put('/admin/journals/' + journalId + '/media/reorder', { orderedIds }),
      updateMediaCaption: (relationId, caption) => http.put('/admin/journal-media/' + relationId, { caption }),
      deleteMedia: relationId => http.delete('/admin/journal-media/' + relationId),
      templates: (enabledOnly = false) => http.get('/admin/journal-templates', { params: { enabledOnly } }),
      template: id => http.get('/admin/journal-templates/' + id),
      createTemplate: body => http.post('/admin/journal-templates', body),
      updateTemplate: (id, body) => http.put('/admin/journal-templates/' + id, body),
      deleteTemplate: id => http.delete('/admin/journal-templates/' + id),
      duplicateTemplate: id => http.post('/admin/journal-templates/' + id + '/duplicate'),
      generateTemplate: (id, body) => http.post('/admin/journal-templates/' + id + '/generate', body),
      // ——— 随手记 ———
      // 写入路径全部字段可选：只要知道属于哪次旅行就能落库，其余之后补。
      // 「二十秒记完」这件事经不起任何一次校验失败。
      moments: (tripId, day, unsorted) => http.get('/admin/moments', { params: { tripId, day, unsorted } }),
      moment: id => http.get('/admin/moments/' + id),
      unsortedMoments: tripId => http.get('/admin/moments/unsorted-count', { params: { tripId } }),
      createMoment: body => http.post('/admin/moments', body),
      updateMoment: (id, body) => http.put('/admin/moments/' + id, body),
      deleteMoment: id => http.delete('/admin/moments/' + id),
      addMomentPhoto: (id, form) => http.post('/admin/moments/' + id + '/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000
      }),
      removeMomentPhoto: (id, mediaId) => http.delete('/admin/moments/' + id + '/media/' + mediaId),
      momentRoute: (tripId, day) => http.get('/admin/moments/route', { params: { tripId, day } }),
      // AI 润色是否可用（取决于服务端有没有配 key）；不可用时前端不显示那个选项
      momentAiStatus: () => http.get('/admin/moments/ai-status'),
      // 把一天的随手记整理成日记草稿。replace 为空表示追加，不会冲掉已经写好的部分
      composeMoments: body => http.post('/admin/moments/compose', body),
      themes: (enabledOnly = false) => http.get('/admin/themes', { params: { enabledOnly } }),
      // 全站主题当前是跟随季节还是固定，以及此刻实际生效的是哪一套
      siteThemeState: () => http.get('/admin/themes/site-state'),
      createTheme: body => http.post('/admin/themes', body),
      updateTheme: (id, body) => http.put('/admin/themes/' + id, body),
      deleteTheme: id => http.delete('/admin/themes/' + id),
      duplicateTheme: id => http.post('/admin/themes/' + id + '/duplicate'),
      // 备份走浏览器直接下载：文件可能很大，用 axios 收进内存再存盘没必要
      backupUrl: (includePhotos = true) => '/api/admin/backup?includePhotos=' + includePhotos,
      // 上传主题首页封面图。不绑定具体主题，返回的 id 由前端填进 definitionJson.hero.mediaId
      uploadThemeHero: form => http.post('/admin/themes/hero', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
  };
})();
