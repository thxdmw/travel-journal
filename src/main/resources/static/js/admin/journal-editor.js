/* 旅行日记编辑器。正文的 inline 编辑在 js/common/journal-block-editor.js。 */
(function () {
  const { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue;
  const { api, A, JM, applyTheme, message, fail, confirm, session, loadSession,
    tripStatusOptions, itineraryTypeOptions, journalStatusLabels, statusLabel, itineraryTypeLabel,
    shortTime, timeRange, IMAGE_TYPES, TAB_ORDER, renderTemplateSample,
    required, check, slugRule, validateForm, fillForm } = window.AdminShared;
  const JournalEditor = {
    components:{ JournalBlockEditor:window.JournalBlockEditor },
    setup() {
      const route=VueRouter.useRoute(),router=VueRouter.useRouter();
      const id=ref(route.params.id==='new'?null:Number(route.params.id));
      const trips=ref([]),stops=ref([]),media=ref([]),templates=ref([]),themes=ref([]);
      const linkedItinerary=ref([]),linkedExpenses=ref([]),linkedBudget=ref(null);
      const pageLoading=ref(true),saving=ref(false),uploading=ref(false),dirty=ref(false);
      const formRef=ref(null),fileInput=ref(null),cameraInput=ref(null),blockEditor=ref(null),photoSheet=ref(false);
      const selectedMedia=ref([]),dragFrom=ref(null),dragOver=ref(null),uploads=ref([]),mediaSort=ref('custom');
      const metaOpen=ref(false),mediaOpen=ref(false);
      const metaCollapsed=ref(localStorage.getItem('travel-journal.editor-meta-collapsed')==='on');
      const templateDialog=ref(false),selectedTemplate=ref(null),templateData=ref({}),generating=ref(false);
      const previewLink=ref(''),autoSaveState=ref(''),tagInput=ref('');
      const previewOpen=ref(false),articlePreviewEl=ref(null);
      const form=reactive({tripId:route.query.tripId?Number(route.query.tripId):null,tripStopId:null,
        title:'',slug:'',excerpt:'',contentJson:window.JournalBlocks.emptyDocument(),occurredOn:'',
        coverMediaId:null,status:'DRAFT',themeKey:null,templateId:null,templateVersion:null,tags:[]});
      const rules={title:[required('请填写日记标题')],tripId:[required('请选择所属旅行','change')],
        slug:[required('请填写 Slug'),slugRule],occurredOn:[required('请选择发生日期','change')]};
      const wordCount=computed(()=>window.JournalBlocks.wordCount(form.contentJson));
      const autoSaveLabel=computed(()=>SAVE_LABELS[autoSaveState.value]||'');
      // 顶部那行「8月10日 · 东京」，都是能推出来的，作者不用填
      const contextLine=computed(()=>{
        const day=form.occurredOn?form.occurredOn.replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,y,m,d)=>Number(m)+'月'+Number(d)+'日'):'';
        const city=stops.value.find(item=>Number(item.id)===Number(form.tripStopId))?.cityName;
        return [day,city].filter(Boolean).join(' · ');
      });
      /** 摘要留空就用正文开头，作者不需要为了列表卡片再写一遍。 */
      const autoExcerpt=computed(()=>{
        const first=(form.contentJson?.blocks||[]).find(block=>block.type==='paragraph'&&block.data?.text);
        return first?String(first.data.text).slice(0,80):'';
      });
      const excerptHint=computed(()=>autoExcerpt.value?'留空则用开头：'+autoExcerpt.value.slice(0,24)+'…':'摘要（留空自动取正文开头）');
      /*
       * 发布前看看成稿长什么样。
       *
       * 用的就是公开端那一套渲染（JournalBlocks.render + .journal-document 样式），
       * 所以这里看到的和读者看到的是同一份东西。数据都在本地，不需要先保存、
       * 也不用像「预览链接」那样签一个 token 再开新标签。
       */
      const previewHtml=computed(()=>previewOpen.value
        ? window.JournalBlocks.render(form.contentJson,media.value) : '');
      function openArticlePreview(){
        blockEditor.value?.flushInline();
        metaOpen.value=false;
        nextTick(()=>previewOpen.value=true);
      }
      // 轮播、胶片条和灯箱是渲染完之后再挂行为的，预览里同样要挂上才点得动
      watch(previewHtml,()=>nextTick(()=>{JM.teardown(articlePreviewEl.value);JM.enhance(articlePreviewEl.value);}));
      watch(previewOpen,value=>{if(!value)JM.teardown(articlePreviewEl.value);});
      const allSelected=computed(()=>media.value.length>0&&selectedMedia.value.length===media.value.length);
      const templateBlocks=computed(()=>selectedTemplate.value?.definitionJson?.blocks||[]);
      const LD=window.LocalDraft;
      // 自动保存的四种可见状态；作者只需要知道「存住了没有」，不需要盯着一个保存按钮
      const SAVE_LABELS={saving:'保存中…',saved:'已保存',offline:'离线 · 待同步',failed:'保存失败 · 点击重试',local:'修改已暂存于本机'};
      const travelContext=computed(()=>({
        trip:trips.value.find(item=>Number(item.id)===Number(form.tripId))||null,
        stop:stops.value.find(item=>Number(item.id)===Number(form.tripStopId))||null,
        stops:stops.value,itinerary:linkedItinerary.value,expenses:linkedExpenses.value,budget:linkedBudget.value,
        occurredOn:form.occurredOn
      }));
      let travelDataRequest=0,localTimer=null,remoteTimer=null,fallbackTimer=null;
      // 上传是并发的，这个单调递增的序号记住每张照片是第几个被选中的
      let uploadSeq=0;

      async function loadTravelData(tripId){
        const request=++travelDataRequest;
        if(!tripId){stops.value=[];linkedItinerary.value=[];linkedExpenses.value=[];linkedBudget.value=null;return;}
        const result=await Promise.all([A.stops(tripId),A.itinerary(tripId),A.expenses(tripId),A.budget(tripId)]);
        if(request!==travelDataRequest)return;
        stops.value=result[0]||[];linkedItinerary.value=result[1]||[];linkedExpenses.value=result[2]||[];linkedBudget.value=result[3]||null;
        if(!stops.value.some(item=>Number(item.id)===Number(form.tripStopId)))form.tripStopId=null;
      }

      /**
       * 正文里可能还有正在上传的占位块，它们只是本地状态。
       *
       * 传完的把 pendingKey 抹掉即可；没传完的整块不提交——否则服务器上会留下一个
       * 没有图片的空图块，刷新之后既看不到进度也传不下去了。
       */
      const PENDING_FIELDS=['pendingKey','pendingKeys','pendingOrder','pendingResolved'];
      function cleanContent(){
        const source=form.contentJson?.blocks||[];
        const blocks=source.filter(block=>{
          if(block.data?.pendingKey)return !!block.data.mediaId;
          if(block.data?.pendingKeys?.length)return (block.data.mediaIds||[]).length>0;
          return true;
        }).map(block=>{
          if(!PENDING_FIELDS.some(field=>block.data?.[field]!=null))return block;
          const copy=JSON.parse(JSON.stringify(block));
          PENDING_FIELDS.forEach(field=>delete copy.data[field]);
          return copy;
        });
        return {schemaVersion:1,blocks:blocks};
      }
      function body(){return{tripId:form.tripId,tripStopId:form.tripStopId,title:form.title,slug:form.slug,
        excerpt:form.excerpt||autoExcerpt.value,contentJson:cleanContent(),occurredOn:form.occurredOn,coverMediaId:form.coverMediaId,
        themeKey:form.themeKey,templateId:form.templateId,templateVersion:form.templateVersion,tags:form.tags||[]};}
      const today=()=>new Date().toLocaleDateString('sv-SE');
      /** 今天正好停在哪个城市——新建日记时自动带出来，不用作者自己去选。 */
      function stopOfDay(day){
        if(!day)return null;
        return stops.value.find(item=>(!item.arrivalDate||item.arrivalDate<=day)&&(!item.departureDate||item.departureDate>=day))||null;
      }
      /**
       * 保证手上有一个真实的草稿 id。
       *
       * 旅行途中打开编辑器就该能立刻拍照、打字、自动保存，而这些都需要 id。
       * 所以进页面先向后端要一篇空草稿，标题、slug 之类由后端补默认值。
       */
      async function ensureDraft(){
        if(id.value)return true;
        const tripId=form.tripId||trips.value.find(x=>x.status==='ONGOING')?.id||trips.value[0]?.id;
        if(!tripId){ElementPlus.ElMessage.warning('请先建立一次旅行，再开始写日记');return false;}
        try{
          const created=await A.createJournalDraft({tripId:tripId,occurredOn:form.occurredOn||today()});
          id.value=created.id;
          Object.assign(form,{tripId:created.tripId,slug:created.slug,occurredOn:created.occurredOn,status:created.status});
          router.replace({path:'/journals/'+created.id,query:route.query.from?{from:route.query.from}:{}});
          autoSaveState.value='saved';
          return true;
        }catch(e){fail(e);return false;}
      }
      async function load(){
        pageLoading.value=true;
        try{
          const result=await Promise.all([(await A.trips({page:1,pageSize:100})).items,A.templates(true),A.themes(true)]);
          trips.value=result[0];templates.value=result[1];themes.value=result[2];
          if(id.value){const entry=await A.journal(id.value);Object.assign(form,entry);
            form.contentJson=window.JournalBlocks.normalize(entry.contentJson);media.value=await A.media(id.value);}
          else{if(!form.occurredOn)form.occurredOn=today();await ensureDraft();}
          if(form.tripId)await loadTravelData(form.tripId);
          // 日期落在哪座城市是能推出来的，别让作者在路上再选一次
          if(!form.tripStopId)form.tripStopId=stopOfDay(form.occurredOn)?.id||null;
          selectedTemplate.value=templates.value.find(x=>x.id===form.templateId)||null;if(selectedTemplate.value)selectTemplate(selectedTemplate.value);
          const saved=await LD.get(id.value);
          // 本机快照比服务器新才值得问——正常关页面时已经 flush 过，通常不会走到这里
          if(saved?.form&&JSON.stringify(saved.form.contentJson)!==JSON.stringify(form.contentJson)){
            try{await confirm('发现本机保存的编辑快照，是否恢复？');Object.assign(form,saved.form);}catch(_){}
          }
          await LD.remove(id.value);
          dirty.value=false;
        }catch(e){fail(e);}finally{pageLoading.value=false;}
      }
      watch(()=>form.tripId,async value=>{try{await loadTravelData(value);}catch(e){fail(e);}});
      watch(()=>form.occurredOn,value=>{if(value&&!form.slug)form.slug='journal-'+value.replaceAll('-','')+'-'+Date.now().toString().slice(-5);});
      watch(metaCollapsed,value=>localStorage.setItem('travel-journal.editor-meta-collapsed',value?'on':'off'));
      /*
       * 保存节奏分三层，都是从「作者正在打字」出发的：
       *   停手 600ms  → 写本机 IndexedDB，断电断网也不丢
       *   停手 3s     → 提交服务器
       *   45s 兜底    → 一直在打字的长段落也不会太久没落库
       * 另外 pagehide / 切到后台时立刻 flush 一次。
       */
      watch(form,()=>{
        if(pageLoading.value)return;
        dirty.value=true;
        if(form.status==='PUBLISHED'){autoSaveState.value='local';scheduleLocal();return;}
        scheduleLocal();scheduleRemote();
      },{deep:true});
      function scheduleLocal(){
        if(localTimer)clearTimeout(localTimer);
        localTimer=setTimeout(()=>{localTimer=null;LD.put(id.value,body());},600);
      }
      function scheduleRemote(){
        if(remoteTimer)clearTimeout(remoteTimer);
        remoteTimer=setTimeout(()=>{remoteTimer=null;autoSave();},3000);
      }
      /*
       * 写请求串行队列。
       *
       * 自动保存、手动保存、发布、更新发布都会把整篇正文全量写上去。一旦两个请求
       * 同时在路上，先发的那个晚一步到达服务端就会用旧正文盖掉新正文——在信号
       * 不好的地铁或山里，这种时序错位并不罕见。所以所有写操作排一条链，
       * 前一个落地了才发下一个。
       */
      let saveChain=Promise.resolve();
      function enqueue(task){
        // 前一个失败也要让后面的继续排，否则一次网络抖动会让这一篇彻底不再保存
        const next=saveChain.then(task,task);
        saveChain=next.then(()=>{},()=>{});
        return next;
      }
      /** 正文的击键攒在 300ms 去抖里，任何一次保存之前都要先把它压到 form 上。 */
      function flushEditor(){blockEditor.value?.flushInline();}
      /** 静默的服务端草稿保存。校验交给后端的草稿标准，前端不再拦空标题。 */
      async function autoSave(){
        if(!id.value||!dirty.value||form.status!=='DRAFT')return false;
        if(!navigator.onLine){autoSaveState.value='offline';return false;}
        return enqueue(async()=>{
          // 排队期间可能已经被前一次保存带走了，或者作者已经发布
          if(!dirty.value||form.status!=='DRAFT')return false;
          saving.value=true;autoSaveState.value='saving';
          const snapshot=body();
          try{
            await A.saveJournalDraft(id.value,snapshot);
            // 保存期间作者可能又敲了几个字，那就还是脏的，留给下一轮
            if(JSON.stringify(snapshot)===JSON.stringify(body()))dirty.value=false;
            autoSaveState.value='saved';await LD.remove(id.value);
            return true;
          }catch(e){autoSaveState.value=navigator.onLine?'failed':'offline';return false;}
          finally{saving.value=false;}
        });
      }
      /** 手动保存，会把提示说出来；发布、预览链接这类操作前也先走它。 */
      async function save(silent=false){
        if(form.status==='PUBLISHED'){
          if(!silent)ElementPlus.ElMessage.info('已发布日记请使用“更新发布”，公开内容才会改变');
          return false;
        }
        if(!await ensureDraft())return false;
        flushEditor();await nextTick();
        if(remoteTimer){clearTimeout(remoteTimer);remoteTimer=null;}
        return enqueue(async()=>{
          saving.value=true;autoSaveState.value='saving';
          try{
            await A.saveJournalDraft(id.value,body());
            dirty.value=false;autoSaveState.value='saved';await LD.remove(id.value);
            if(!silent)message('草稿已保存');return true;
          }catch(e){autoSaveState.value='failed';fail(e);return false;}finally{saving.value=false;}
        });
      }
      /** 发布走严格校验：这里先在前端把缺的字段指出来，后端还会再拦一道。 */
      async function publish(){
        flushEditor();await nextTick();
        if(!await validateForm(formRef)){metaCollapsed.value=false;return;}
        if(!await save(true))return;
        return enqueue(async()=>{
          try{await A.publishJournal(id.value);form.status='PUBLISHED';await nextTick();dirty.value=false;autoSaveState.value='saved';await LD.remove(id.value);message('日记已发布');}catch(e){fail(e);}
        });
      }
      async function updatePublished(){
        flushEditor();await nextTick();
        if(!await validateForm(formRef)){metaCollapsed.value=false;return;}
        return enqueue(async()=>{
          saving.value=true;
          try{await A.updateJournal(id.value,body());await nextTick();dirty.value=false;
            autoSaveState.value='saved';await LD.remove(id.value);message('公开文章已更新');
          }catch(e){fail(e);autoSaveState.value='failed';}finally{saving.value=false;}
        });
      }
      async function unpublish(){
        return enqueue(async()=>{
          try{await A.unpublishJournal(id.value);form.status='DRAFT';await nextTick();dirty.value=false;autoSaveState.value='saved';await LD.remove(id.value);message('日记已撤回');}catch(e){fail(e);}
        });
      }
      /*
       * 选完照片立刻插进正文，上传在后台跑。
       *
       * 原来是串行 for-await：一次选 12 张就得从第一张排到第十二张，中间任何一张失败
       * 后面全停。现在并发 3 条，每张自己记进度，失败的单独重试，不挡别人。
       */
      const UPLOAD_CONCURRENCY=3;
      async function upload(files){
        const list=Array.from(files||[]).filter(x=>x.type&&x.type.startsWith('image/'));
        if(!list.length||!await ensureDraft())return;
        const tasks=list.map(file=>reactive({key:'up_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
          name:file.name,file:file,preview:URL.createObjectURL(file),progress:0,status:'waiting',seq:uploadSeq++}));
        uploads.value.push(...tasks);
        blockEditor.value?.insertPending(tasks);
        // 先把照片本身落进 IndexedDB 再开始传：File 只活在内存里，浏览器一被系统
        // 杀掉就没了。存下来之后即使这次没传成，重新打开还能接着传。
        await Promise.all(tasks.map(task=>LD.queuePhoto(id.value,task.key,task.file,task.name)));
        await runUploadQueue(tasks);
      }
      /*
       * 把上次没传完的照片捡回来。
       *
       * 进编辑器时跑一次。正文里那些 pendingKey 占位块是随草稿一起存下来的，
       * 这里按 key 对上号，就能接着上传并把 mediaId 填回原来的位置。
       * 队列里已经没有对应占位块的（作者后来删掉了那一段），顺手清掉。
       */
      async function resumePendingUploads(){
        if(!id.value)return;
        const queued=await LD.pendingPhotos(id.value);
        if(!queued.length)return;
        const keys=new Set();
        (form.contentJson?.blocks||[]).forEach(block=>{
          if(block.data?.pendingKey)keys.add(block.data.pendingKey);
          (block.data?.pendingKeys||[]).forEach(key=>keys.add(key));
        });
        const orphans=queued.filter(item=>!keys.has(item.key));
        orphans.forEach(item=>LD.dropPhoto(item.key));
        const resumable=queued.filter(item=>keys.has(item.key));
        if(!resumable.length)return;
        const tasks=resumable.map(item=>reactive({key:item.key,name:item.name,file:item.blob,
          preview:URL.createObjectURL(item.blob),progress:0,status:'waiting',seq:uploadSeq++}));
        uploads.value.push(...tasks);
        ElementPlus.ElMessage.info('有 '+tasks.length+' 张照片上次没传完，正在继续');
        await runUploadQueue(tasks);
      }
      async function runUploadQueue(tasks){
        uploading.value=true;
        let cursor=0;
        const workers=Array.from({length:Math.min(UPLOAD_CONCURRENCY,tasks.length)},async()=>{
          while(cursor<tasks.length)await sendUpload(tasks[cursor++]);
        });
        await Promise.all(workers);
        uploading.value=false;
        const failed=uploads.value.filter(task=>task.status==='failed').length;
        if(failed)ElementPlus.ElMessage.warning(failed+' 张照片没传上去，可以在正文里点重试');
        // 服务端的 sortOrder 是按请求到达顺序写的，和挑选顺序对不上；
        // 一批传完之后按本地顺序回写一次，下次打开这篇日记看到的才是同一个次序
        if(tasks.some(task=>task.status==='done'))await syncMediaOrder();
        // 传完的任务留在队列里没意义，但要等占位块都换成真图之后再清
        uploads.value=uploads.value.filter(task=>task.status!=='done');
      }
      /** 把图片管理器里当前的顺序告诉服务端，失败了不打扰作者——下次重排还会再试。 */
      async function syncMediaOrder(){
        if(!id.value||!media.value.length)return;
        try{await A.reorderMedia(id.value,media.value.map(item=>item.relationId));}catch(_){}
      }
      /**
       * 把传完的照片放回它在这一批里的位置。
       *
       * 并发上传下完成顺序是乱的：选了三张，第三张最小最先传完，直接 push 的话
       * 图片管理器里就成了「3、1、2」。seq 是挑选时分配的单调序号，插到第一个
       * 序号比它大的元素前面，列表顺序就和相册里看到的一致。
       */
      function insertUploaded(task,item){
        item.uploadSeq=task.seq;
        const at=media.value.findIndex(x=>x.uploadSeq!=null&&x.uploadSeq>task.seq);
        if(at<0)media.value.push(item);else media.value.splice(at,0,item);
      }
      async function sendUpload(task){
        task.status='uploading';task.progress=0;
        try{
          const data=new FormData();data.append('file',task.file);
          const item=await A.uploadMedia(id.value,data,event=>{
            if(event.total)task.progress=Math.min(99,Math.round(event.loaded*100/event.total));
          });
          insertUploaded(task,item);
          task.status='done';task.progress=100;
          blockEditor.value?.resolvePending(task.key,item.id);
          // 服务器上已经有这张了，本机那份副本就没必要再占空间
          LD.dropPhoto(task.key);
          URL.revokeObjectURL(task.preview);
        }catch(e){task.status='failed';}
      }
      function retryUpload(key){
        const task=uploads.value.find(item=>item.key===key);
        if(task&&task.status==='failed')runUploadQueue([task]);
      }
      /** 作者把占位块删掉了，本机存的那张也一起清掉，不然它会一直躺在队列里。 */
      function discardUpload(key){
        uploads.value=uploads.value.filter(item=>item.key!==key);
        LD.dropPhoto(key);
      }
      /*
       * 网络回来了就把失败的那几张重新排上。
       *
       * 旅行中最常见的是「进了地铁 → 传失败 → 出站有信号」这一串，让作者自己
       * 回来点重试很不合理——他这时通常已经在看风景了。
       */
      function onOnline(){
        const failed=uploads.value.filter(task=>task.status==='failed');
        if(failed.length)runUploadQueue(failed);
        if(dirty.value)autoSave();
      }
      function picked(event){upload(event.target.files);event.target.value='';}
      /** 触摸设备先问拍照还是相册；鼠标设备没有相机这一说，直接开文件选择。 */
      function capture(){
        if(window.matchMedia('(pointer:coarse)').matches){photoSheet.value=true;return;}
        fileInput.value?.click();
      }
      function dropped(event){upload(event.dataTransfer?.files);}
      function pasted(event){const files=Array.from(event.clipboardData?.files||[]).filter(x=>x.type?.startsWith('image/'));if(files.length){event.preventDefault();upload(files);}}
      async function setCover(item){
        if(form.status==='PUBLISHED'){form.coverMediaId=item.id;message('已选择封面，点击“更新发布”后生效');return;}
        try{await A.setCover(id.value,item.id);form.coverMediaId=item.id;message('封面已更新');}catch(e){fail(e);}
      }
      async function saveCaption(item){try{await A.updateMediaCaption(item.relationId,item.caption||'');message('图注已保存');}catch(e){fail(e);}}
      async function removeMedia(item){try{await confirm('确定删除这张图片吗？正文仍在使用时系统会拒绝删除。');await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);if(form.coverMediaId===item.id)form.coverMediaId=null;}catch(e){if(e!=='cancel'&&e!=='close')fail(e);}}
      function toggleSelect(item){selectedMedia.value=selectedMedia.value.includes(item.id)?selectedMedia.value.filter(x=>x!==item.id):[...selectedMedia.value,item.id];}
      function toggleSelectAll(){selectedMedia.value=allSelected.value?[]:media.value.map(x=>x.id);}
      function insertSelected(){const ids=media.value.filter(x=>selectedMedia.value.includes(x.id)).map(x=>x.id);mediaOpen.value=false;blockEditor.value?.insertMedia(ids,ids.length>1?'gallery':'image');}
      function onDragStart(index){dragFrom.value=index;}
      function onDragOver(index){if(dragFrom.value!==null&&dragFrom.value!==index)dragOver.value=index;}
      function onDragEnd(){dragFrom.value=null;dragOver.value=null;}
      async function onDrop(index){
        const from=dragFrom.value;onDragEnd();if(from===null||from===index)return;
        const before=media.value.slice(),next=before.slice();next.splice(index,0,next.splice(from,1)[0]);media.value=next;
        try{await A.reorderMedia(id.value,next.map(x=>x.relationId));}catch(e){media.value=before;fail(e);}
      }
      async function sortByCaptureTime(){if(!id.value)return;try{const count=await A.sortMediaByCaptureTime(id.value);media.value=await A.media(id.value);selectedMedia.value=[];message('已按拍摄时间重排 '+count+' 张图片');}catch(e){fail(e);}}
      /**
       * 图片排序。
       *
       * 拖拽在手机上不好用（HTML5 drag & drop 在触摸设备基本不触发），而九成情况
       * 「按拍摄时间」就已经是想要的顺序了，所以把它做成主路径，拖拽退回桌面端的补充手段。
       */
      async function applyMediaSort(mode){
        if(!id.value||mode==='custom')return;
        if(mode==='capture')return sortByCaptureTime();
        const ordered=[...media.value].sort((a,b)=>a.id-b.id);
        const before=media.value;media.value=ordered;
        try{await A.reorderMedia(id.value,ordered.map(item=>item.relationId));message('已按上传顺序排列');}
        catch(e){media.value=before;fail(e);}
      }
      async function removeSelected(){
        const targets=media.value.filter(x=>selectedMedia.value.includes(x.id));if(!targets.length)return;
        try{await confirm('确定删除选中的 '+targets.length+' 张图片吗？正文仍在使用的图片不会被删除。');}catch(_){return;}
        let removed=0,failed=0;
        for(const item of targets){try{await A.deleteMedia(item.relationId);media.value=media.value.filter(x=>x.relationId!==item.relationId);if(form.coverMediaId===item.id)form.coverMediaId=null;removed++;}catch(_){failed++;}}
        selectedMedia.value=[];if(removed)message('已删除 '+removed+' 张图片');if(failed)ElementPlus.ElMessage.warning(failed+' 张图片仍被正文使用，未删除');
      }
      function selectTemplate(item){
        selectedTemplate.value=item;templateData.value={};
        (item.definitionJson?.blocks||[]).forEach(block=>{
          if(block.type==='trip-info')templateData.value[block.id]={weather:'',mood:''};
          else if(['text','textarea','quote'].includes(block.type))templateData.value[block.id]={value:''};
          else if(block.type==='rating')templateData.value[block.id]={value:0,comment:''};
          else if(block.type==='checklist')templateData.value[block.id]=[];
          else if(block.type==='image')templateData.value[block.id]={mediaIds:null};
          else if(block.type==='gallery')templateData.value[block.id]={mediaIds:[]};
        });
      }
      function openTemplate(){templateDialog.value=true;if(selectedTemplate.value)selectTemplate(selectedTemplate.value);else if(templates.value.length)selectTemplate(templates.value[0]);}
      async function generateFromTemplate(){
        if(!selectedTemplate.value)return;
        if(form.contentJson.blocks?.length)try{await confirm('使用模板会替换当前正文，是否继续？');}catch(_){return;}
        generating.value=true;
        try{
          const result=await A.generateTemplate(selectedTemplate.value.id,{journalId:id.value,tripId:form.tripId,
            tripStopId:form.tripStopId,occurredOn:form.occurredOn,data:templateData.value});
          form.contentJson=window.JournalBlocks.normalize(result.contentJson);
          form.templateId=result.templateId;form.templateVersion=result.templateVersion;
          if(!form.title){const city=stops.value.find(x=>x.id===form.tripStopId)?.cityName;form.title=[city,selectedTemplate.value.name].filter(Boolean).join(' · ');}
          if(!form.slug&&form.occurredOn)form.slug='journal-'+form.occurredOn.replaceAll('-','')+'-'+Date.now().toString().slice(-5);
          templateDialog.value=false;
          if(result.skippedBlocks?.length)ElementPlus.ElMessage.info('没有数据，已跳过：'+result.skippedBlocks.join('、'));
        }catch(e){fail(e);}finally{generating.value=false;}
      }
      async function makePreviewLink(){if(!await save(true))return;try{const value=await A.createPreviewLink(id.value);previewLink.value=value.url||value.previewUrl||value.token;if(value.token&&!String(previewLink.value).startsWith('http'))previewLink.value=location.origin+'/#/preview/'+value.token;await navigator.clipboard?.writeText(previewLink.value);message('预览链接已复制');}catch(e){fail(e);}}
      function openPublished(){if(form.slug)window.open(location.origin+'/#/journals/'+encodeURIComponent(form.slug),'_blank','noopener');}
      function addTag(){const value=tagInput.value.trim();if(value&&!form.tags.includes(value))form.tags.push(value);tagInput.value='';}
      function removeTag(value){form.tags=form.tags.filter(x=>x!==value);}
      function backToTrip(){
        if(!form.tripId)return router.push('/trips');
        const tab=TAB_ORDER.includes(route.query.from)?route.query.from:'journals';
        router.push({path:'/trips/'+form.tripId,query:{tab}});
      }
      /*
       * 页面正在关闭时的最后一次提交。
       *
       * pagehide 之后普通的 XHR 会被浏览器直接掐掉，所以走 fetch(keepalive)——
       * 它允许请求在文档卸载后继续发出去。用它而不是 sendBeacon，是因为这条接口
       * 是 PATCH 且需要带 CSRF 头，sendBeacon 只能发 POST 且改不了请求头。
       */
      function keepaliveSave(){
        const token=(window.document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)||[])[1];
        const headers={'Content-Type':'application/json'};
        if(token)headers['X-XSRF-TOKEN']=decodeURIComponent(token);
        try{
          fetch('/api/admin/journals/'+id.value+'/draft',
            {method:'PATCH',credentials:'include',keepalive:true,headers:headers,body:JSON.stringify(body())})
            .catch(()=>{});
        }catch(_){}
      }
      /**
       * 页面要走了：本机快照必须落下去，服务端能赶上就赶上。
       *
       * @param closing 页面是不是真的要卸载了。true 走 keepalive——那是最后一次机会；
       *                false（只是切到后台）走正常的排队保存，页面还活着，没必要
       *                绕过队列去和正在路上的那次保存抢时序。
       */
      function flushAll(closing){
        if(pageLoading.value||!id.value)return;
        // 最后这几个字还攒在正文的 300ms 去抖里，不先压下来就既进不了本机快照
        // 也进不了服务端——「写完最后一句话直接锁屏」正好会踩中这个窗口
        flushEditor();
        if(localTimer){clearTimeout(localTimer);localTimer=null;}
        if(!dirty.value)return;
        // 本机快照总是先落：即使服务端那次没成功或时序错乱，下次打开还能恢复
        LD.put(id.value,body());
        if(remoteTimer){clearTimeout(remoteTimer);remoteTimer=null;}
        if(form.status!=='DRAFT'||!navigator.onLine)return;
        if(closing)keepaliveSave();else autoSave();
      }
      function onPageHide(){flushAll(true);}
      function onHidden(){if(window.document.visibilityState==='hidden')flushAll(false);}
      onMounted(async()=>{
        await load();
        // 上次没传完的照片接着传。放在 load 之后，正文里的占位块这时才对得上号
        resumePendingUploads();
        // 一直不停手打字时的兜底，比原来 20 秒轮询更省，因为停手 3 秒就已经存过了
        fallbackTimer=setInterval(autoSave,45000);
        window.addEventListener('pagehide',onPageHide);
        window.addEventListener('visibilitychange',onHidden);
        window.addEventListener('online',onOnline);
      });
      onBeforeUnmount(async()=>{
        clearInterval(fallbackTimer);
        window.removeEventListener('pagehide',onPageHide);
        window.removeEventListener('visibilitychange',onHidden);
        window.removeEventListener('online',onOnline);
        // 父组件的 onBeforeUnmount 比子组件先跑，所以正文那 300ms 去抖里的击键
        // 这时还没上来，必须先主动压一次再取 body()
        flushEditor();
        if(localTimer)clearTimeout(localTimer);
        if(remoteTimer){clearTimeout(remoteTimer);remoteTimer=null;}
        const journalId=id.value;if(!journalId)return;
        if(dirty.value&&form.status==='DRAFT'){
          const snapshot=body();
          // 排在队尾，别和还在路上的自动保存抢；写失败就留在本机等下次打开恢复
          try{await enqueue(()=>A.saveJournalDraft(journalId,snapshot));await LD.remove(journalId);}
          catch(_){LD.put(journalId,snapshot);}
        }
        /*
         * 这里不再删「看起来是空的」草稿。
         *
         * 退出瞬间最后一次保存可能还没落库，服务端此刻看到的空正文并不代表作者
         * 真的什么都没写；删错一篇正文的代价远高于库里多一条空记录。真正的空草稿
         * 交给服务端的定时清理，满 24 小时没人动过再收，见 EmptyDraftCleaner。
         */
      });
      return{form,formRef,rules,id,trips,stops,media,templates,themes,travelContext,pageLoading,saving,uploading,dirty,
        fileInput,cameraInput,blockEditor,metaCollapsed,metaOpen,mediaOpen,photoSheet,wordCount,contextLine,excerptHint,templateDialog,selectedTemplate,templateData,templateBlocks,
        generating,previewLink,autoSaveState,autoSaveLabel,autoSave,tagInput,previewOpen,previewHtml,articlePreviewEl,openArticlePreview,
        save,publish,updatePublished,unpublish,picked,capture,dropped,pasted,setCover,saveCaption,removeMedia,
        selectedMedia,allSelected,dragOver,uploads,mediaSort,retryUpload,discardUpload,applyMediaSort,toggleSelect,toggleSelectAll,insertSelected,onDragStart,onDragOver,onDragEnd,onDrop,sortByCaptureTime,removeSelected,
        selectTemplate,openTemplate,generateFromTemplate,makePreviewLink,openPublished,addTag,removeTag,backToTrip,statusLabel};
    },
    template:`
      <div v-loading="pageLoading" class="editor-page" element-loading-text="正在打开日记…" @paste="pasted">
        <div class="editor-top">
          <el-button link class="editor-back" @click="backToTrip">←<em>返回</em></el-button>
          <div class="editor-top-state">
            <button type="button" class="editor-save-state" :class="'is-'+autoSaveState" :disabled="autoSaveState!=='failed'" @click="autoSave">{{autoSaveLabel||statusLabel(form.status)}}</button>
            <span class="editor-context">{{contextLine}}</span>
          </div>
          <span class="word-count">{{wordCount}} 字</span>
          <div class="editor-actions">
            <el-button @click="openTemplate">{{form.templateId?'填写模板':'从模板开始'}}</el-button>
            <template v-if="form.status==='PUBLISHED'"><el-button @click="openPublished">查看文章</el-button><el-button @click="unpublish">撤回</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="updatePublished">更新发布</el-button></template>
            <template v-else><el-button @click="openArticlePreview">预览全文</el-button><el-button :disabled="!id" @click="makePreviewLink">预览链接</el-button><el-button type="primary" @click="publish">发布日记</el-button></template>
          </div>
          <button type="button" class="editor-preview-btn" aria-label="预览全文" @click="openArticlePreview">👁</button>
          <button type="button" class="editor-more" aria-label="日记信息与更多操作" @click="metaOpen=true">···</button>
        </div>

        <button type="button" class="editor-meta-toggle" :aria-expanded="!metaCollapsed" @click="metaCollapsed=!metaCollapsed">
          <span>{{metaCollapsed?(form.title||'日记信息'):'收起日记信息'}}</span><i class="editor-meta-toggle__chev" aria-hidden="true"></i>
        </button>
        <el-form ref="formRef" :model="form" :rules="rules" class="editor-meta-group editor-meta-form" :class="{collapsed:metaCollapsed,'is-open':metaOpen}"><div class="editor-meta-inner">
          <div class="editor-meta"><el-form-item prop="title"><el-input v-model="form.title" placeholder="日记标题（发布前必填）"/></el-form-item>
            <el-form-item prop="tripId"><el-select v-model="form.tripId" filterable placeholder="所属旅行（必填）"><el-option v-for="x in trips" :key="x.id" :label="x.title" :value="x.id"/></el-select></el-form-item>
            <el-form-item><el-select v-model="form.tripStopId" clearable placeholder="城市"><el-option v-for="x in stops" :key="x.id" :label="x.cityName" :value="x.id"/></el-select></el-form-item>
            <el-form-item prop="occurredOn"><el-date-picker :editable="$allowTextInput" v-model="form.occurredOn" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" placeholder="发生日期（必填）"/></el-form-item></div>
          <div class="editor-meta editor-meta-secondary"><el-form-item><el-input v-model="form.excerpt" maxlength="500" :placeholder="excerptHint"/></el-form-item>
            <el-form-item><el-select v-model="form.themeKey" clearable placeholder="继承旅行 / 全站主题"><el-option v-for="x in themes" :key="x.themeKey" :label="x.name" :value="x.themeKey"/></el-select></el-form-item></div>
          <div class="editor-tags"><el-tag v-for="tag in form.tags" :key="tag" closable disable-transitions @close="removeTag(tag)">{{tag}}</el-tag>
            <el-input v-model="tagInput" size="small" class="tag-input" placeholder="加标签，回车确认" @keyup.enter="addTag"/></div>
          <details class="editor-advanced"><summary>高级</summary>
            <el-form-item prop="slug" label="网址 slug"><el-input v-model="form.slug" placeholder="留空由系统生成"/></el-form-item>
          </details>
          <div v-if="previewLink" class="preview-link-bar"><span>预览链接：</span><code>{{previewLink}}</code></div>
          <div class="editor-sheet-actions">
            <el-button @click="openArticlePreview">预览全文</el-button>
            <el-button @click="metaOpen=false;openTemplate()">{{form.templateId?'填写模板':'从模板开始'}}</el-button>
            <template v-if="form.status==='PUBLISHED'"><el-button @click="openPublished">查看文章</el-button><el-button @click="unpublish">撤回</el-button><el-button type="primary" :loading="saving" :disabled="!dirty" @click="metaOpen=false;updatePublished()">更新发布</el-button></template>
            <template v-else><el-button :disabled="!id" @click="makePreviewLink">预览链接</el-button><el-button type="primary" @click="metaOpen=false;publish()">发布日记</el-button></template>
          </div>
        </div></el-form>
        <div v-if="metaOpen" class="editor-sheet-backdrop" @click="metaOpen=false"></div>

        <div class="editor-grid block-editor-layout">
          <section class="editor-column editor-column--write"><div class="editor-label">日记内容 <small>点击区块之间的 ＋ 添加</small></div>
            <journal-block-editor ref="blockEditor" v-model="form.contentJson" :media="media" :uploads="uploads" :travel-context="travelContext" @retry-upload="retryUpload" @discard-upload="discardUpload"/></section>
          <aside class="editor-column media-column" :class="{'is-open':mediaOpen}"><div class="editor-label">图片管理 <small>点击图片可放大预览</small><button type="button" class="media-close" @click="mediaOpen=false">收起</button></div>
            <label class="upload-box" :class="{uploading}" @dragover.prevent @drop.prevent="dropped">
              <input ref="fileInput" type="file" multiple accept="image/jpeg,image/png,image/webp" @change="picked">
              <strong>{{uploading?'正在上传…':'选择、拖放或粘贴图片'}}</strong><span>JPEG / PNG / WebP · 上传后可直接配置版式</span>
              <el-button type="primary" plain :disabled="uploading" @click.prevent="fileInput.click()">＋ 上传图片</el-button>
            </label>
            <div class="media-manager-toolbar"><el-checkbox :model-value="allSelected" @change="toggleSelectAll">全选</el-checkbox>
              <el-select v-model="mediaSort" size="small" class="media-sort" @change="applyMediaSort">
                <el-option label="按拍摄时间" value="capture"/><el-option label="按上传顺序" value="upload"/><el-option label="自定义顺序" value="custom"/>
              </el-select><small class="hide-on-mobile">电脑上可拖动调整</small>
              <el-button v-if="selectedMedia.length" type="primary" size="small" @click="insertSelected">插入选中（{{selectedMedia.length}}）</el-button>
              <el-button v-if="selectedMedia.length" link type="danger" size="small" @click="removeSelected">删除选中</el-button></div>
            <div class="media-side"><article v-for="(item,index) in media" :key="item.relationId" class="media-item"
              :class="{'is-selected':selectedMedia.includes(item.id),'is-drag-over':dragOver===index}" draggable="true"
              @dragstart="onDragStart(index)" @dragover.prevent="onDragOver(index)" @dragend="onDragEnd" @drop.prevent="onDrop(index)">
              <el-checkbox class="media-item-check" :model-value="selectedMedia.includes(item.id)" @change="toggleSelect(item)"/>
              <el-image :src="item.thumbnailUrl||item.displayUrl" :preview-src-list="[item.displayUrl]" :alt="item.caption||item.filename" fit="cover" preview-teleported/>
              <div class="media-item-main"><el-input class="media-item-caption" v-model="item.caption" size="small" placeholder="图注（留空则不显示）" @change="saveCaption(item)"/>
                <div class="media-item-actions"><el-button link size="small" @click="mediaOpen=false;blockEditor.insertMedia(item.id,'image')">插入</el-button>
                  <el-button link size="small" @click="setCover(item)">{{form.coverMediaId===item.id?'当前封面':'设封面'}}</el-button>
                  <el-button link type="danger" size="small" @click="removeMedia(item)">删除</el-button></div></div></article>
              <el-empty v-if="!media.length" :image-size="52" description="还没有图片"/></div>
          </aside>
          <div v-if="mediaOpen" class="editor-sheet-backdrop" @click="mediaOpen=false"></div>
        </div>

        <nav class="editor-toolbar" aria-label="写作工具">
          <button type="button" @click="blockEditor?.openCatalog()"><b>＋</b><em>内容</em></button>
          <button type="button" :disabled="uploading" @click="capture()"><b>📷</b><em>照片</em></button>
          <button type="button" @click="blockEditor?.insertQuick('location-card')"><b>📍</b><em>地点</em></button>
          <button type="button" @click="blockEditor?.insertQuick('heading')"><b>H</b><em>标题</em></button>
          <button type="button" @click="blockEditor?.insertQuick('quote')"><b>”</b><em>引用</em></button>
          <button type="button" @click="mediaOpen=true"><b>🖼</b><em>{{media.length}}</em></button>
        </nav>
        <el-dialog v-model="previewOpen" title="文章预览" width="min(900px,96vw)" class="article-preview-dialog" append-to-body align-center destroy-on-close>
          <p class="article-preview-note">下面是这篇日记发布出去之后读者看到的样子，用的是和公开页面同一套渲染。</p>
          <article ref="articlePreviewEl" class="preview journal-document article-preview-body">
            <header class="article-preview-head">
              <p v-if="contextLine">{{contextLine}}</p>
              <h1 :class="{empty:!form.title}">{{form.title||'（还没有标题，发布前需要填）'}}</h1>
              <div v-if="form.tags?.length" class="article-preview-tags"><span v-for="tag in form.tags" :key="tag">{{tag}}</span></div>
            </header>
            <div v-if="previewHtml" v-html="previewHtml"></div>
            <p v-else class="article-preview-empty">正文还是空的，写点什么再回来看看。</p>
          </article>
          <template #footer>
            <el-button @click="previewOpen=false">继续写</el-button>
            <el-button v-if="form.status!=='PUBLISHED'" type="primary" @click="previewOpen=false;publish()">发布日记</el-button>
          </template>
        </el-dialog>

        <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="picked">
        <template v-if="photoSheet">
          <div class="editor-sheet-backdrop" @click="photoSheet=false"></div>
          <div class="photo-sheet">
            <button type="button" @click="photoSheet=false;cameraInput.click()">拍照</button>
            <button type="button" @click="photoSheet=false;fileInput.click()">从相册选择</button>
            <button type="button" class="cancel" @click="photoSheet=false">取消</button>
          </div>
        </template>

        <el-dialog v-model="templateDialog" title="用模板开始写作" width="min(980px,96vw)">
          <div class="template-writing"><aside class="template-choices"><button v-for="item in templates" :key="item.id" type="button"
            :class="{active:selectedTemplate?.id===item.id}" @click="selectTemplate(item)"><strong>{{item.name}}</strong><span>{{item.description}}</span><small>{{item.builtin?'系统模板':'我的模板'}}</small></button></aside>
            <section v-if="selectedTemplate" class="template-fields"><header><h3>{{selectedTemplate.name}}</h3><p>模板会一次生成可继续编辑的内容块，不会与正文长期绑定。</p></header>
              <div v-for="block in templateBlocks" :key="block.id" class="template-field">
                <template v-if="block.type==='trip-info'"><label>{{block.title}}</label><div class="form-grid form-grid-2"><el-input v-model="templateData[block.id].weather" placeholder="天气"/><el-input v-model="templateData[block.id].mood" placeholder="心情"/></div></template>
                <template v-else-if="['text','textarea','quote'].includes(block.type)"><label>{{block.title}} <em v-if="block.required">必填</em></label><el-input v-model="templateData[block.id].value" :type="block.type==='text'?'text':'textarea'" :rows="4" :placeholder="block.config?.placeholder||'填写内容'"/></template>
                <template v-else-if="block.type==='rating'"><label>{{block.title}}</label><el-rate v-model="templateData[block.id].value" :max="block.config?.max||5"/></template>
                <template v-else-if="block.type==='image'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" clearable><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select></template>
                <template v-else-if="block.type==='gallery'"><label>{{block.title}}</label><el-select v-model="templateData[block.id].mediaIds" multiple><el-option v-for="item in media" :key="item.id" :label="item.caption||item.filename" :value="item.id"/></el-select></template>
                <div v-else class="template-auto-block"><strong>{{block.title}}</strong><span>从当前旅行自动整理</span></div>
              </div></section></div>
          <template #footer><el-button @click="templateDialog=false">取消</el-button><el-button type="primary" :loading="generating" @click="generateFromTemplate">生成内容块</el-button></template>
        </el-dialog>
      </div>`
  };

  Object.assign(window.AdminPages, { JournalEditor });
})();
