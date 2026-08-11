/*
 * 随手记。
 *
 * 这一页只服务一个场景：人正站在路边，二十秒之内要把刚看到的东西记下来。
 * 所以整页只有一个输入框、一个相机按钮和一个「记下」——没有表单、没有必填校验、
 * 没有保存对话框。任何一次多余的确认都可能让那一条永远不存在。
 *
 * 晚上回到住处再按「整理成日记」，白天那十几条碎片会按时间变成一篇带开场、
 * 章节和照片的草稿，作者在上面接着写就行，而不是对着空白页回忆。
 */
(function () {
  const { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const { api, A, message, fail, confirm, shortTime, session } = window.AdminShared;

  const Moments = {
    setup() {
      const router = VueRouter.useRouter(), route = VueRouter.useRoute();
      const trips = ref([]), moments = ref([]), loading = ref(false), saving = ref(false);
      const pending = ref([]), syncing = ref(false), online = ref(navigator.onLine);
      const composing = ref(''), photoInput = ref(null), cameraInput = ref(null), photoSheet = ref(false);
      const LAST_TRIP_KEY = 'travel-journal.moment-last-trip', TRIPS_CACHE_KEY = 'travel-journal.moment-trips';
      const tripId = ref(route.query.tripId ? Number(route.query.tripId) : Number(localStorage.getItem(LAST_TRIP_KEY)) || null);
      const editing = ref(null), locating = ref(false);
      const LD = window.LocalDraft;
      // 还没提交的那一条。照片先攒在本地，等 moment 落库拿到 id 才真正上传
      const draft = reactive({ content: '', placeName: '', mood: '', latitude: null, longitude: null, files: [] });

      const trip = computed(() => trips.value.find(item => Number(item.id) === Number(tripId.value)) || null);
      /** 按天分组。day 是服务端按事件发生地日期算好的，前端不重复猜时区。 */
      const grouped = computed(() => {
        const groups = new Map();
        moments.value.forEach(item => {
          if (!groups.has(item.day)) groups.set(item.day, []);
          groups.get(item.day).push(item);
        });
        return Array.from(groups, ([day, items]) => ({
          day, items, unsorted: items.filter(item => !item.sorted).length
        }));
      });
      const draftPreviews = computed(() => draft.files.map(file => ({
        name: file.name, url: URL.createObjectURL(file)
      })));
      const canSubmit = computed(() => !!tripId.value && (draft.content.trim() || draft.files.length));
      const localDate = date => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
        String(date.getDate()).padStart(2,'0')].join('-');

      function dayLabel(day) {
        const today = localDate(new Date());
        if (day === today) return '今天';
        const previous = new Date(); previous.setDate(previous.getDate()-1);
        const yesterday = localDate(previous);
        if (day === yesterday) return '昨天';
        return String(day).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => Number(m) + '月' + Number(d) + '日');
      }
      function timeLabel(value, zoneId) {
        if (!value) return '';
        try {
          return new Intl.DateTimeFormat('zh-CN', { timeZone: zoneId || undefined,
            hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
        } catch (_) {
          return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      }

      async function load() {
        if (!tripId.value) { moments.value = []; return; }
        loading.value = true;
        try { moments.value = await A.moments(tripId.value); }
        catch (e) { if (navigator.onLine) fail(e); }
        finally { loading.value = false; }
      }
      async function loadTrips() {
        try {
          trips.value = (await A.trips({ page: 1, pageSize: 100 })).items || [];
          localStorage.setItem(TRIPS_CACHE_KEY,JSON.stringify(trips.value));
          // 没指定就默认进行中的那次旅行——路上打开这一页，想记的几乎总是当前这趟
          if (!trips.value.some(item=>Number(item.id)===Number(tripId.value)))
            tripId.value = (trips.value.find(item => item.status === 'ONGOING') || trips.value[0])?.id || null;
        } catch (e) {
          try { trips.value=JSON.parse(localStorage.getItem(TRIPS_CACHE_KEY)||'[]'); } catch (_) { trips.value=[]; }
          if (!trips.value.some(item=>Number(item.id)===Number(tripId.value)))
            tripId.value=(trips.value.find(item=>item.status==='ONGOING')||trips.value[0])?.id||null;
          if(navigator.onLine)fail(e);
        }
      }

      /*
       * 记下一条。
       *
       * 先建记录再传照片：照片可能很大、网络可能很差，但文字必须立刻落库。
       * 反过来做的话，一次上传失败就会把已经写好的那句话一起弄丢。
       */
      const clientId = prefix => prefix + '_' + (window.crypto?.randomUUID
        ? window.crypto.randomUUID().replaceAll('-','')
        : Date.now().toString(36)+Math.random().toString(36).slice(2));
      function occurrencePayload() {
        const now=new Date(),offset=-now.getTimezoneOffset();
        let zone='';
        try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(_){}
        if(!zone){const sign=offset>=0?'+':'-',abs=Math.abs(offset);zone=sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');}
        return {occurredAt:now.toISOString(),occurredLocalDate:localDate(now),
          occurredZoneId:zone,utcOffsetMinutes:offset};
      }
      async function refreshPending() {
        pending.value=tripId.value?await LD.pendingMoments(tripId.value):[];
      }

      async function submit() {
        if (!canSubmit.value || saving.value) return;
        saving.value = true;
        const files = draft.files.slice();
        try {
          const id=clientId('moment');
          const queued=await LD.queueMoment({clientId:id,tripId:Number(tripId.value),
            payload:Object.assign({clientId:id,tripId:Number(tripId.value),content:draft.content.trim(),
              placeName:draft.placeName.trim()||null,mood:draft.mood.trim()||null,
              latitude:draft.latitude,longitude:draft.longitude},occurrencePayload()),
            photos:files.map((file,index)=>({clientId:clientId('photo'),name:file.name||('photo-'+(index+1)+'.jpg'),
              type:file.type||'image/jpeg',blob:file,uploaded:false}))});
          if(!queued)throw new Error('这台设备的离线存储不可用或空间不足，请先不要关闭页面');
          Object.assign(draft, { content: '', placeName: '', mood: '', latitude: null, longitude: null, files: [] });
          await refreshPending();
          if(navigator.onLine)syncPending();
          message(navigator.onLine?'已安全记在本机，正在同步':'已安全记在本机，联网后自动同步');
        } catch (e) { ElementPlus.ElMessage.error(e?.message||'没能写入本机，请保留当前页面后重试'); }
        finally { saving.value = false; }
      }
      let syncPromise=null;
      async function syncOne(original) {
        let record=await LD.updatePendingMoment(original.clientId,{state:'syncing',error:null});
        if(!record)return;
        try{
          let serverId=record.serverId;
          if(!serverId){
            const created=await A.createMoment(record.payload);
            serverId=created.id;
            const persisted=await LD.updatePendingMoment(record.clientId,{serverId:serverId,state:'syncing'});
            record=persisted||Object.assign({},record,{serverId:serverId,state:'syncing'});
          }
          let photos=(record?.photos||[]).slice();
          for(let index=0;index<photos.length;index++){
            const photo=photos[index];
            if(photo.uploaded)continue;
            const form=new FormData();
            form.append('file',photo.blob,photo.name);
            await A.addMomentPhoto(serverId,form,photo.clientId);
            photos=photos.map((item,i)=>i===index?Object.assign({},item,{uploaded:true}):item);
            const persisted=await LD.updatePendingMoment(original.clientId,{serverId:serverId,photos:photos,state:'syncing'});
            record=persisted||Object.assign({},record,{serverId:serverId,photos:photos,state:'syncing'});
          }
          await LD.dropPendingMoment(original.clientId);
        }catch(e){
          await LD.updatePendingMoment(original.clientId,{state:'failed',
            retryCount:(record?.retryCount||0)+1,error:navigator.onLine?'同步失败，点此重试':'等待网络'});
        }
      }
      async function syncPending() {
        if(!navigator.onLine)return;
        if(syncPromise)return syncPromise;
        syncing.value=true;
        syncPromise=(async()=>{
          const queue=await LD.pendingMoments();
          for(const record of queue){if(!navigator.onLine)break;await syncOne(record);}
          await refreshPending();
          if(tripId.value)await load();
        })().finally(()=>{syncing.value=false;syncPromise=null;});
        return syncPromise;
      }
      async function retryPending(item){
        await LD.updatePendingMoment(item.clientId,{state:'pending',error:null});
        await refreshPending();syncPending();
      }
      async function discardPending(item){
        try{await confirm('放弃这条尚未同步的随手记吗？本机文字和照片会被删除。');}catch(_){return;}
        await LD.dropPendingMoment(item.clientId);await refreshPending();
      }

      function pickPhotos(event) {
        const selected=Array.from(event.target.files||[]).filter(file=>file.type?.startsWith('image/'));
        const available=Math.max(0,9-draft.files.length);
        draft.files.push(...selected.slice(0,available));
        if(selected.length>available)ElementPlus.ElMessage.warning('一条随手记最多保留 9 张照片');
        event.target.value = '';
      }
      function dropDraftPhoto(index) { draft.files.splice(index, 1); }
      /** 触摸设备先问拍照还是相册；鼠标设备没有相机这一说，直接开文件选择。 */
      function capture() {
        if (window.matchMedia('(pointer:coarse)').matches) { photoSheet.value = true; return; }
        photoInput.value?.click();
      }
      /*
       * 定位。
       *
       * 只取坐标不反查地名：反查要调第三方接口，在信号差的地方会卡住整条记录路径。
       * 地名让作者顺手打两个字，或者之后整理时再补。
       */
      function locate() {
        if (!navigator.geolocation) { ElementPlus.ElMessage.warning('这台设备不支持定位'); return; }
        locating.value = true;
        navigator.geolocation.getCurrentPosition(position => {
          draft.latitude = Number(position.coords.latitude.toFixed(7));
          draft.longitude = Number(position.coords.longitude.toFixed(7));
          locating.value = false;
          message('已记下当前位置');
        }, () => { locating.value = false; ElementPlus.ElMessage.warning('没能取到位置，可以手填地点'); },
          { enableHighAccuracy: true, timeout: 8000 });
      }

      /*
       * 某一天的路线。
       *
       * 整理成日记之前先看一眼当天是怎么走的，往往能想起还漏记了什么。默认收着——
       * 这一页的主路径是「记一条」，地图是回顾时才用的东西，不该抢第一屏。
       */
      const routeDay = ref(''), routeEl = ref(null), routePoints = ref([]);
      const replaying = ref(false), replayIndex = ref(-1);
      let routeMap = null, routeControl = null;
      async function toggleRoute(group) {
        if (routeDay.value === group.day) { closeRoute(); return; }
        closeRoute();
        routeDay.value = group.day;
        try { routePoints.value = await A.momentRoute(tripId.value, group.day); }
        catch (e) { fail(e); routeDay.value = ''; return; }
        if (!routePoints.value.length) {
          routeDay.value = '';
          ElementPlus.ElMessage.info('这一天的随手记还没有位置信息，记的时候点一下「位置」就有了');
          return;
        }
        await nextTick();
        routeMap = window.DayRoute?.simpleMap(routeEl.value);
        routeControl = window.DayRoute?.render(routeMap, routePoints.value, {
          source: routePoints.value[0]?.source,
          onState: state => { replaying.value = state.playing; replayIndex.value = state.index; }
        });
      }
      function closeRoute() {
        routeControl?.destroy(); routeControl = null;
        routeMap?.remove(); routeMap = null;
        routeDay.value = ''; routePoints.value = []; replaying.value = false; replayIndex.value = -1;
      }
      function toggleReplay() { routeControl?.play(); }

      async function removeMoment(item) {
        try { await confirm('删除这条随手记吗？'); } catch (_) { return; }
        try {
          await A.deleteMoment(item.id);
          moments.value = moments.value.filter(x => x.id !== item.id);
        } catch (e) { fail(e); }
      }
      function startEdit(item) { editing.value = { id: item.id, content: item.content, placeName: item.placeName || '', mood: item.mood || '' }; }
      async function saveEdit() {
        const value = editing.value;
        if (!value) return;
        try {
          const updated = await A.updateMoment(value.id, { content: value.content, placeName: value.placeName || null, mood: value.mood || null });
          const index = moments.value.findIndex(item => item.id === value.id);
          if (index >= 0) moments.value[index] = updated;
          editing.value = null;
          message('已修改');
        } catch (e) { fail(e); }
      }
      async function removePhoto(item, photo) {
        try {
          await A.removeMomentPhoto(item.id, photo.id);
          item.photos = item.photos.filter(x => x.id !== photo.id);
        } catch (e) { fail(e); }
      }

      /*
       * 整理成日记。
       *
       * 已经整理过的那一天会问一句：默认是追加，这样「白天整理一次、晚上再整理一次」
       * 不会把先写好的部分冲掉；选替换才会重新生成整篇。
       */
      /*
       * AI 润色只改文字，不改顺序、时间、地点和照片归属——那些永远由规则决定。
       * 服务端没配 key 时这个按钮根本不出现：与其让作者点了才发现没反应，
       * 不如一开始就不给这个选项。
       */
      const aiAvailable = ref(false);
      async function compose(group, useAi) {
        const sorted = group.items.filter(item => item.sorted);
        const journalIds = [...new Set(sorted
          .map(item => item.journalEntryId)
          .filter(value => value !== null && value !== undefined))];
        if (journalIds.length > 1) {
          ElementPlus.ElMessage.warning('这一天的随手记已被整理进多篇日记，请先进入目标日记后再继续追加。');
          return;
        }
        // 已整理记录按接口约定一定带目标 id；缺失时宁可停下，也不能误建第二篇日记。
        if (sorted.length && journalIds.length !== 1) {
          ElementPlus.ElMessage.warning('暂时无法确认要追加到哪篇日记，请刷新页面后重试。');
          return;
        }
        const journalId = journalIds[0] ?? null;
        let replace = false;
        if (sorted.length) {
          try {
            await ElementPlus.ElMessageBox.confirm(
              '这一天有 ' + sorted.length + ' 条已经整理过了。追加会把新的接在正文后面，替换会重新生成整篇。',
              '再整理一次', { confirmButtonText: '追加', cancelButtonText: '替换整篇', distinguishCancelAndClose: true, type: 'info' });
          } catch (action) {
            if (action === 'close') return;
            replace = true;
          }
        }
        composing.value = group.day + (useAi ? '-ai' : '');
        try {
          const result = await A.composeMoments({ tripId: tripId.value, day: group.day, journalId, replace, useAi: !!useAi });
          await load();
          const parts = ['已整理 ' + result.momentCount + ' 条随手记'];
          if (result.photoCount) parts.push(result.photoCount + ' 张照片');
          message(parts.join('、') + (useAi ? (result.polished ? '，文字已润色' : '，这次用的是原文') : ''));
          router.push('/journals/' + result.journalId);
        } catch (e) { fail(e); }
        finally { composing.value = ''; }
      }

      watch(tripId, value => {
        router.replace({ path: '/moments', query: value ? { tripId: value } : {} });
        if(value)localStorage.setItem(LAST_TRIP_KEY,String(value));
        load();refreshPending();
      });
      const onOnline=()=>{online.value=true;if(!session.offline)syncPending();};
      const onOffline=()=>{online.value=false;refreshPending();};
      const onSessionReady=()=>{if(session.user&&!session.offline)syncPending();};
      onMounted(async () => {
        await loadTrips();
        await Promise.all([load(),refreshPending()]);
        window.addEventListener('online',onOnline);
        window.addEventListener('offline',onOffline);
        window.addEventListener('travel-session-ready',onSessionReady);
        if(navigator.onLine)syncPending();
        try { aiAvailable.value = (await A.momentAiStatus()).available; } catch (_) { aiAvailable.value = false; }
      });
      onBeforeUnmount(()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);
        window.removeEventListener('travel-session-ready',onSessionReady);});

      return { trips, tripId, trip, moments, grouped, pending, syncing, online, loading, saving, composing, draft, draftPreviews, canSubmit,
        photoInput, cameraInput, photoSheet, editing, locating,
        dayLabel, timeLabel, shortTime, submit, pickPhotos, dropDraftPhoto, capture, locate,
        removeMoment, startEdit, saveEdit, removePhoto, compose, retryPending, discardPending,
        routeDay, routeEl, routePoints, replaying, replayIndex, toggleRoute, toggleReplay, aiAvailable };
    },
    template: `
      <div class="moments-page">
        <div class="page-head"><div><h2>随手记</h2><p>路上看到什么就记一条，晚上一键整理成日记。</p></div>
          <el-select v-model="tripId" filterable placeholder="选择旅行" class="moments-trip">
            <el-option v-for="item in trips" :key="item.id" :label="item.title" :value="item.id"/>
          </el-select></div>

        <section class="moment-composer panel">
          <el-input v-model="draft.content" type="textarea" :rows="3" resize="none"
            placeholder="现在看到了什么？一句话就够。"/>
          <div class="moment-shots" v-if="draftPreviews.length">
            <figure v-for="(item,index) in draftPreviews" :key="item.url"><img :src="item.url" alt="">
              <button type="button" @click="dropDraftPhoto(index)">×</button></figure>
          </div>
          <div class="moment-composer-meta">
            <el-input v-model="draft.placeName" placeholder="在哪儿（可选）" class="moment-place"/>
            <el-input v-model="draft.mood" placeholder="心情（可选）" maxlength="10" class="moment-mood"/>
          </div>
          <div class="moment-composer-actions">
            <button type="button" @click="capture"><b>📷</b><span>照片</span></button>
            <button type="button" :class="{active:draft.latitude!=null}" :disabled="locating" @click="locate">
              <b>📍</b><span>{{draft.latitude!=null?'已定位':(locating?'定位中':'位置')}}</span></button>
            <span class="moment-spacer"></span>
            <el-button type="primary" :loading="saving" :disabled="!canSubmit" @click="submit">记下</el-button>
          </div>
        </section>

        <section v-if="pending.length" class="moment-pending panel" aria-live="polite">
          <header><div><strong>待同步</strong><small>{{pending.length}} 条已安全保存在这台设备</small></div>
            <span :class="{active:syncing}">{{!online?'等待网络':(syncing?'正在同步':'等待重试')}}</span></header>
          <article v-for="item in pending" :key="item.clientId">
            <time>{{timeLabel(item.payload.occurredAt,item.payload.occurredZoneId)}}</time>
            <div><p v-if="item.payload.content">{{item.payload.content}}</p>
              <small><template v-if="item.photos?.length">{{item.photos.length}} 张照片 · </template>{{item.error||(item.state==='syncing'?'正在同步':'已保存在本机')}}</small></div>
            <button v-if="item.state==='failed'" type="button" @click="retryPending(item)">重试</button>
            <button type="button" class="danger" @click="discardPending(item)">放弃</button>
          </article>
        </section>

        <div v-loading="loading" class="moment-timeline">
          <section v-for="group in grouped" :key="group.day" class="moment-day">
            <header><h3>{{dayLabel(group.day)}}</h3><small>{{group.items.length}} 条<template v-if="group.unsorted"> · {{group.unsorted}} 条待整理</template></small>
              <el-button size="small" plain @click="toggleRoute(group)">{{routeDay===group.day?'收起路线':'看路线'}}</el-button>
              <el-button size="small" type="primary" plain :loading="composing===group.day" @click="compose(group,false)">整理成日记</el-button>
              <el-button v-if="aiAvailable" size="small" type="primary" :loading="composing===group.day+'-ai'" title="让 AI 把碎片句子润色成段落。时间、地点和照片不受影响" @click="compose(group,true)">✦ AI 整理</el-button></header>
            <div v-if="routeDay===group.day" class="moment-route">
              <div ref="routeEl" class="moment-route-map"></div>
              <button type="button" class="moment-route-play" :class="{playing:replaying}" @click="toggleReplay">{{replaying?'停止回放':'▶ 回放这一天'}}</button>
            </div>
            <article v-for="item in group.items" :key="item.id" class="moment-item" :class="{'is-sorted':item.sorted}">
              <time>{{timeLabel(item.occurredAt,item.occurredZoneId)}}</time>
              <div class="moment-body">
                <template v-if="editing&&editing.id===item.id">
                  <el-input v-model="editing.content" type="textarea" :rows="3"/>
                  <div class="moment-edit-meta"><el-input v-model="editing.placeName" placeholder="地点"/><el-input v-model="editing.mood" placeholder="心情"/></div>
                  <div class="moment-edit-actions"><el-button size="small" @click="editing=null">取消</el-button><el-button size="small" type="primary" @click="saveEdit">保存</el-button></div>
                </template>
                <template v-else>
                  <p v-if="item.content">{{item.content}}</p>
                  <div v-if="item.photos.length" class="moment-shots">
                    <figure v-for="photo in item.photos" :key="photo.id"><img :src="photo.thumbnailUrl" alt="">
                      <button type="button" @click="removePhoto(item,photo)">×</button></figure>
                  </div>
                  <footer>
                    <span v-if="item.placeName">📍 {{item.placeName}}</span>
                    <span v-else-if="item.latitude!=null">📍 已记录坐标</span>
                    <span v-if="item.mood">· {{item.mood}}</span>
                    <span v-if="item.sorted" class="moment-sorted">已整理</span>
                    <button type="button" @click="startEdit(item)">修改</button>
                    <button type="button" class="danger" @click="removeMoment(item)">删除</button>
                  </footer>
                </template>
              </div>
            </article>
          </section>
          <el-empty v-if="!loading&&!grouped.length" :image-size="60"
            :description="tripId?'这次旅行还没有随手记，上面写一条试试':'先选一次旅行'"/>
        </div>

        <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="pickPhotos">
        <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="pickPhotos">
        <template v-if="photoSheet">
          <div class="editor-sheet-backdrop" @click="photoSheet=false"></div>
          <div class="photo-sheet">
            <button type="button" @click="photoSheet=false;cameraInput.click()">拍照</button>
            <button type="button" @click="photoSheet=false;photoInput.click()">从相册选择</button>
            <button type="button" class="cancel" @click="photoSheet=false">取消</button>
          </div>
        </template>
      </div>`
  };

  Object.assign(window.AdminPages, { Moments });
})();
