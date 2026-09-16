import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useNavigate, useOutletContext, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fromState } from '../utils/editorNav'
import { modelsApi, backendControlApi } from '../utils/api'
import { safeHref } from '../utils/url'
import { useDebouncedCallback } from '../hooks/useDebounce'
import { useOperations } from '../hooks/useOperations'
import { useResources } from '../hooks/useResources'
import { modelBudget } from '../utils/modelBudget'
import SearchableSelect from '../components/SearchableSelect'
import PageHeader from '../components/PageHeader'
import GalleryLoader from '../components/GalleryLoader'
import Toggle from '../components/Toggle'
import RecommendedModels from '../components/RecommendedModels'
import SplitView from '../components/split/SplitView'
import EntityRail from '../components/split/EntityRail'
import InstalledModels, { ModelLifecycleDetailShell, modelUseCases } from './InstalledModels'
import { formatBytes } from '../utils/format'
import { ENTITY_GROUPS, groupForEntity } from '../utils/entityGroups'
import { renderMarkdown, stripMarkdown } from '../utils/markdown'
import React from 'react'


// The rail groups what it has, so it needs enough rows for the groups to mean
// something. At nine a page rarely held more than one bucket, so turning one
// rebuilt the rail's whole structure; at thirty the sections are stable enough
// to read as structure rather than noise, and there are five times fewer pages.
const RAIL_PAGE_SIZE = 30

// How many estimates to have in flight at once. See the fetch effect: this
// exists to leave connections free for whatever the user clicks next.
const ESTIMATE_CONCURRENCY = 4

const CHART_HEIGHT = 96
const CHART_LABEL_ROOM = 15

const CONTEXT_SIZES = [8192, 16384, 32768, 65536, 131072, 262144]
const CONTEXT_LABELS = ['8K', '16K', '32K', '64K', '128K', '256K']
const FITS_FILTER_STORAGE_KEY = 'neurodesk-models-fits-filter'
const COLLAPSE_VARIANTS_STORAGE_KEY = 'neurodesk-models-collapse-variants-filter'
// The deduplicated gallery is what a user asking "what can I install" wants, so
// that is the default. The control exists for the other job: browsing every
// build the gallery holds, which the collapsed view makes impossible however
// many pages you turn.
const COLLAPSE_VARIANTS_DEFAULT = true

// How many listing rows to ask for when resolving one variant's gallery entry
// by exact name. The term is the full name, so the entry is always in the
// match set; the page size only has to be wide enough that the fuzzy matches
// sharing that name's prefix cannot push it past the first page.
const VARIANT_DETAIL_SEARCH_ITEMS = 100

// Only 'on'/'off' counts as a choice. An earlier build wrote '1'/'0' from an
// effect that ran on mount, so those values record that the page was opened
// rather than that anyone picked a view, and honouring them would pin a
// visitor to a default they never chose.
const readCollapseVariantsPreference = () => {
  try {
    const stored = localStorage.getItem(COLLAPSE_VARIANTS_STORAGE_KEY)
    if (stored === 'on') return true
    if (stored === 'off') return false
    return COLLAPSE_VARIANTS_DEFAULT
  } catch {
    return COLLAPSE_VARIANTS_DEFAULT
  }
}

// Per-model execution preference, keyed by model name. The backend decides how
// a model actually executes; this page only remembers what the operator asked
// for and reports the resource frame (VRAM vs system RAM) in that frame. A map
// in one key survives an unload/reload, a NeuroDesk restart, a new chat, and
// switching models and back, while keeping each model's choice independent so
// CPU-only for one never disables the GPU for another.
const EXEC_MODE_STORAGE_KEY = 'neurodesk-models-exec-mode'

const readExecModes = () => {
  try {
    const parsed = localStorage.getItem(EXEC_MODE_STORAGE_KEY)
    const modes = parsed ? JSON.parse(parsed) : {}
    return modes && typeof modes === 'object' ? modes : {}
  } catch {
    return {}
  }
}

const writeExecModes = (modes) => {
  try {
    localStorage.setItem(EXEC_MODE_STORAGE_KEY, JSON.stringify(modes))
  } catch {
    // Ignore storage errors (e.g., private browsing restrictions).
  }
}

const FILTERS = [
  { key: '', labelKey: 'filters.all', icon: 'fa-layer-group' },
  { key: 'chat', labelKey: 'filters.llm', icon: 'fa-brain' },
  { key: 'image', labelKey: 'filters.image', icon: 'fa-image' },
  { key: 'video', labelKey: 'filters.video', icon: 'fa-video' },
  { key: '3d', labelKey: 'filters.threed', icon: 'fa-cube' },
  { key: 'multimodal', labelKey: 'filters.multimodal', icon: 'fa-shapes' },
  { key: 'vision', labelKey: 'filters.vision', icon: 'fa-eye' },
  { key: 'tts', labelKey: 'filters.tts', icon: 'fa-microphone' },
  { key: 'transcript', labelKey: 'filters.stt', icon: 'fa-headphones' },
  { key: 'diarization', labelKey: 'filters.diarization', icon: 'fa-users' },
  { key: 'sound_classification', labelKey: 'filters.soundClassification', icon: 'fa-ear-listen' },
  { key: 'sound_generation', labelKey: 'filters.soundGen', icon: 'fa-music' },
  { key: 'audio_transform', labelKey: 'filters.audioTransform', icon: 'fa-sliders' },
  { key: 'realtime_audio', labelKey: 'filters.realtimeAudio', icon: 'fa-tower-broadcast' },
  { key: 'embeddings', labelKey: 'filters.embedding', icon: 'fa-vector-square' },
  { key: 'rerank', labelKey: 'filters.rerank', icon: 'fa-sort' },
  { key: 'detection', labelKey: 'filters.detection', icon: 'fa-bullseye' },
  { key: 'vad', labelKey: 'filters.vad', icon: 'fa-wave-square' },
  { key: 'token_classify', labelKey: 'filters.ner', icon: 'fa-tags' },
]

// The chips grouped, using the families the rest of the UI already speaks. The
// unlabelled first section holds "All" on its own, because it is a reset rather
// than a use case and grouping it under a heading would imply otherwise.
const FILTER_SECTIONS = [
  { id: 'all', labelKey: null, keys: [''] },
  { id: 'text', labelKey: 'groups.text', icon: 'fa-brain', pick: 'chat',
    blurbKey: 'shelves.pickText',
    keys: ['chat', 'embeddings', 'rerank', 'token_classify'] },
  { id: 'vision', labelKey: 'groups.vision', icon: 'fa-eye', pick: 'vision',
    blurbKey: 'shelves.pickVision',
    keys: ['vision', 'multimodal', 'detection'] },
  { id: 'audio', labelKey: 'groups.audio', icon: 'fa-wave-square', pick: 'tts',
    blurbKey: 'shelves.pickAudio',
    keys: ['tts', 'transcript', 'diarization', 'sound_classification',
      'sound_generation', 'audio_transform', 'realtime_audio', 'vad'] },
  { id: 'visual', labelKey: 'groups.visual', icon: 'fa-image', pick: 'image',
    blurbKey: 'shelves.pickVisual',
    keys: ['image', 'video', '3d'] },
]

function ModelsLifecycleNav({ activeView, searchParams, t }) {
  const hrefFor = view => {
    const next = new URLSearchParams(searchParams)
    if (view === 'installed') next.set('view', 'installed')
    else next.delete('view')
    const query = next.toString()
    return `/app/models${query ? `?${query}` : ''}`
  }

  return (
    <nav className="tabs mb-md" aria-label={t('lifecycle.navLabel')}>
      <Link
        className={`tab ${activeView === 'explore' ? 'tab-active' : ''}`}
        to={hrefFor('explore')}
        aria-current={activeView === 'explore' ? 'page' : undefined}
      >
        <i className="fas fa-compass" aria-hidden="true" /> {t('lifecycle.views.explore')}
      </Link>
      <Link
        className={`tab ${activeView === 'installed' ? 'tab-active' : ''}`}
        to={hrefFor('installed')}
        aria-current={activeView === 'installed' ? 'page' : undefined}
      >
        <i className="fas fa-hard-drive" aria-hidden="true" /> {t('lifecycle.views.installed')}
      </Link>
    </nav>
  )
}

export default function Models() {
  const { addToast } = useOutletContext()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('models')
  const { operations, cancelOperation, pauseOperation } = useOperations()
  const { resources } = useResources()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = searchParams.get('view') === 'installed' ? 'installed' : 'explore'
  const installedState = ['running', 'idle', 'disabled', 'pinned', 'distributed'].includes(searchParams.get('state'))
    ? searchParams.get('state')
    : 'all'
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [filters, setFilters] = useState([])
  const [sort, setSort] = useState('')
  const [order, setOrder] = useState('asc')
  const [installing, setInstalling] = useState(new Map())
  const [installedProfiles, setInstalledProfiles] = useState({})
  const [expandedFiles, setExpandedFiles] = useState(false)
  // Which model the pane is showing, or null for the discovery shelves. It
  // lives in the URL so a model is linkable and so Back steps out of the detail
  // rather than off the page, which is the one thing the expanded row could
  // never do.
  const selectedName = searchParams.get('model')
  const urlSearch = searchParams.get('q') || ''
  const [stats, setStats] = useState({ total: 0, installed: 0, repositories: 0 })
  // Distinguishes "nothing installed" from "not asked yet". The recommendations
  // panel defaults off the installed count, so it must not read the initial 0.
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [backendFilter, setBackendFilter] = useState('')
  // Narrowing to builds a CPU-only host can serve. Unlike backendFilter it is
  // a capability rather than an engine, so it widens rather than contradicts
  // a backend chosen from the rail: asking for both is "some llama.cpp build I
  // can run without the GPU", not an impossible AND. Sent as capability=cpu.
  const [cpuOnlyFilter, setCpuOnlyFilter] = useState(false)
  // Per-model execution preference, { name: 'cpu' }. A model's own choice
  // survives restarts while leaving every other model on its default (GPU when
  // the host has one).
  const [execModes, setExecModes] = useState(readExecModes)
  const isExecCpu = useCallback((name) => execModes[name] === 'cpu', [execModes])
  // Persist a per-model "Run on CPU" choice all the way to the backend: the
  // config PATCH writes gpu_layers into the model's YAML so the loader really
  // runs it on the CPU/RAM, not just labels it. The localStorage entry only
  // remembers the choice while the backend-side edit is the enforcement.
  const setExecCpu = useCallback(async (name, cpu) => {
    // gpu_layers: 0 forces a wholly CPU/RAM load (no offloaded layers).
    // gpu_layers: null removes the pin, restoring the model's own default
    // (offload-all on a host with an accelerator).
    const patch = cpu ? { gpu_layers: 0 } : { gpu_layers: null }
    try {
      await modelsApi.patchConfig(name, patch)
    } catch (err) {
      addToast(t('detail.cpuPersistFailed', { message: err.message }), 'error')
      return // leave the toggle in its previous state - nothing was configured
    }
    setExecModes(prev => {
      const next = { ...prev }
      if (cpu) next[name] = 'cpu'
      else delete next[name]
      writeExecModes(next)
      return next
    })
    // The config change applies on the next cold load. A model that is
    // already resident was staged with the previous gpu_layers, so release it
    // now (stops the running process) instead of forcing a full restart; the
    // next request reloads it under the new setting. A "not loaded" 404 is
    // fine - there is nothing to stop and the config is already persisted.
    backendControlApi.shutdown({ model: name }).catch(() => {})
  }, [addToast, t])
  const [allBackends, setAllBackends] = useState([])
  const [backendUsecases, setBackendUsecases] = useState({})
  const [estimates, setEstimates] = useState({})
  // Models whose estimate is in flight, so a row can say it is still working
  // rather than silently showing nothing where a size will appear.
  const [pendingEstimates, setPendingEstimates] = useState(() => new Set())
  const [contextSize, setContextSize] = useState(CONTEXT_SIZES[0])
  // True once any listing has come back. Distinguishes a cold start, which has
  // nothing to keep on screen, from a refetch, which does.
  const loadedOnce = useRef(false)
  // Variant descriptions, keyed by model name. The listing only tells us
  // whether an entry declares any; describing them costs the server a network
  // probe per variant, so we ask for one entry at a time and keep the answer
  // for the rest of the page session.
  const [variantData, setVariantData] = useState({})
  // Gallery entries behind individual variants, keyed by variant name. The
  // variant description carries only what ranking needs, and a variant the
  // collapse hides has no listing row of its own, so this is the only place
  // its description, licence, tags, links and files become reachable.
  const [variantDetails, setVariantDetails] = useState({})
  const [fitsFilter, setFitsFilter] = useState(() => {
    try {
      return localStorage.getItem(FITS_FILTER_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  // Collapses the listing to one row per model by hiding the individual builds
  // another entry already offers as variants. Server-side, unlike fitsFilter,
  // because the listing paginates and a client-side narrowing would leave the
  // page count describing the unfiltered set.
  const [collapseVariants, setCollapseVariants] = useState(readCollapseVariantsPreference)
  // Rail groups the user has folded away.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  // What every "will it fit" verdict on this page is measured against. In
  // distributed mode that is the cluster's largest node rather than the
  // controller serving the page, which is usually a GPU-less pod (see
  // modelBudget).
  const budget = modelBudget(resources)
  const totalGpuMemory = budget.totalMemory
  const hasGpu = budget.hasGpu

  const fetchModels = useCallback(async (params = {}) => {
    try {
      setLoading(true)
      const searchVal = params.search !== undefined ? params.search : search
      const filtersVal = params.filters !== undefined ? params.filters : filters
      const sortVal = params.sort !== undefined ? params.sort : sort
      const backendVal = params.backendFilter !== undefined ? params.backendFilter : backendFilter
      const collapseVal = params.collapseVariants !== undefined ? params.collapseVariants : collapseVariants
      const queryParams = {
        page: params.page || page,
        items: RAIL_PAGE_SIZE,
      }
      // Omitted entirely when off rather than sent as false, so opting out asks
      // for exactly the listing every other API client gets.
      //
      // Sent alongside the term rather than instead of it. The handler matches
      // the term against every build the gallery holds either way; the collapse
      // only decides how a match is reported, and grouped, a match on a build
      // another entry offers comes back as that entry. So a search never dead
      // ends, and what "collapsed" means stays decided in one place.
      if (collapseVal) queryParams.collapse_variants = 'true'
      if (filtersVal.length > 0) queryParams.tag = filtersVal.join(',')
      if (searchVal) queryParams.term = searchVal
      if (backendVal) queryParams.backend = backendVal
      // CPU-only narrows by capability rather than by engine (see the state
      // comment): it widens a backend instead of standing in for one. Sent as
      // its own key because the handler interprets capability=cpu without ever
      // pairing it with a backend choice.
      if (cpuOnlyFilter) queryParams.capability = 'cpu'
      if (sortVal) {
        queryParams.sort = sortVal
        queryParams.order = params.order || order
      }
      const data = await modelsApi.list(queryParams)
      setModels(data?.models || [])
      setTotalPages(data?.totalPages || data?.total_pages || 1)
      setStats({
        total: data?.availableModels || 0,
        installed: data?.installedModels || 0,
      })
      setStatsLoaded(true)
      setAllBackends(data?.allBackends || [])
    } catch (err) {
      addToast(t('errors.loadFailed', { message: err.message }), 'error')
    } finally {
      loadedOnce.current = true
      setLoading(false)
    }
  }, [page, search, filters, sort, order, backendFilter, collapseVariants, cpuOnlyFilter, addToast, t])

  useEffect(() => {
    fetchModels()
  }, [page, filters, sort, order, backendFilter, collapseVariants, cpuOnlyFilter])

  // Fetch backend→usecase mapping once on mount
  useEffect(() => {
    modelsApi.backendUsecases().then(setBackendUsecases).catch(() => {})
  }, [])

  // When backend changes, remove selected filters that aren't available
  useEffect(() => {
    if (backendFilter && backendUsecases[backendFilter]) {
      setFilters(prev => {
        const possible = backendUsecases[backendFilter]
        const filtered = prev.filter(k => k === 'multimodal' || possible.includes(k))
        return filtered.length !== prev.length ? filtered : prev
      })
    }
  }, [backendFilter, backendUsecases])

  // Re-fetch when operations change (install/delete completion)
  useEffect(() => {
    if (!loading) fetchModels()
  }, [operations.length])

  // Gallery entries only say whether a model is installed. The capabilities
  // endpoint is authoritative about what that installation can open, so the
  // Explore detail uses it for a useful primary action without duplicating
  // destructive lifecycle controls from Installed.
  useEffect(() => {
    if (activeView !== 'explore') return undefined
    let cancelled = false
    modelsApi.listCapabilities()
      .then(data => {
        if (cancelled) return
        setInstalledProfiles(Object.fromEntries(
          (data?.data || []).map(profile => [profile.id, profile])
        ))
      })
      // A background refresh should not remove an action that was already
      // resolved successfully earlier in this page session.
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeView, operations.length])

  const debouncedFetch = useDebouncedCallback((value) => {
    setPage(1)
    fetchModels({ search: value, page: 1 })
  })

  // Fetch VRAM/size estimates for the loaded page, a few at a time.
  //
  // A browser allows around six connections per host, and an estimate against
  // a cold server cache takes seconds. Firing one per row took every slot, so
  // the request behind a click - the variant list, an install - waited behind a
  // queue of work the user never asked for, and the page felt frozen while the
  // list was in fact already usable. Four leaves room for the interactive
  // request to overtake.
  useEffect(() => {
    if (models.length === 0) return
    const queue = models
      .map(m => m.name || m.id)
      .filter(id => !estimates[id])
    if (queue.length === 0) return

    let cancelled = false
    setPendingEstimates(prev => {
      const next = new Set(prev)
      queue.forEach(id => next.add(id))
      return next
    })

    const settle = (id) => setPendingEstimates(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    let cursor = 0
    const worker = async () => {
      while (!cancelled && cursor < queue.length) {
        const id = queue[cursor++]
        try {
          const est = await modelsApi.estimate(id, CONTEXT_SIZES)
          if (!cancelled && est && (est.sizeBytes || est.estimates)) {
            setEstimates(prev => ({ ...prev, [id]: est }))
          }
        } catch {
          // An estimate is a nicety. The row names the model and installs it
          // either way, so a failure must not stop the queue behind it.
        }
        if (!cancelled) settle(id)
      }
    }
    Promise.all(Array.from({ length: Math.min(ESTIMATE_CONCURRENCY, queue.length) }, worker))

    return () => {
      cancelled = true
      setPendingEstimates(prev => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        queue.forEach(id => next.delete(id))
        return next
      })
    }
  }, [models])

  const handleSearch = (value) => {
    setSearch(value)
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
    debouncedFetch(value)
  }

  // Search is URL-owned. Popstate changes therefore update the controlled
  // field and refetch the gallery instead of leaving the previous term on
  // screen after Back or Forward.
  useEffect(() => {
    if (urlSearch === search) return
    setSearch(urlSearch)
    setPage(1)
    debouncedFetch(urlSearch)
    // debouncedFetch intentionally follows the URL value only. Depending on
    // the callback itself would restart this effect whenever fetch state moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch])

  const toggleFilter = (key) => {
    if (key === '') { setFilters([]); setPage(1); return }
    setFilters(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setPage(1)
  }

  const isFilterAvailable = (key) => {
    if (!backendFilter || key === '' || key === 'multimodal') return true
    const possible = backendUsecases[backendFilter]
    return !possible || possible.includes(key)
  }

  const handleSort = (col) => {
    if (sort === col) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(col)
      setOrder('asc')
    }
  }

  // Fetches an entry's variant description once. Called from the two points
  // where a user actually asks to see variants: opening the split-button menu
  // and expanding the detail row. An entry that declares none never gets here,
  // so it issues no request at all.
  const loadVariants = useCallback((id) => {
    if (!id) return
    setVariantData(prev => {
      if (prev[id]) return prev
      modelsApi.variants(id)
        .then(data => setVariantData(p => ({ ...p, [id]: { loading: false, ...data } })))
        .catch(() => setVariantData(p => ({ ...p, [id]: { loading: false, variants: [] } })))
      return { ...prev, [id]: { loading: true, variants: [] } }
    })
  }, [])

  // Resolves one variant's full gallery entry, once, and only when the user
  // asks to see it.
  //
  // The listing already returns every field the detail view renders, so this
  // keeps the fields off both the listing and DescribeVariants: an expand costs
  // nothing, and a variant nobody opens costs nothing.
  //
  // The query deliberately omits collapse_variants, which is what makes it
  // reach the build itself. Grouped, the same term would answer with the entry
  // that offers this build, and the panel is being asked about the build.
  //
  // A name the listing does not return is a real outcome, not a bug to hide:
  // the gallery can be reloaded between describing the variants and asking
  // about one of them. It is recorded as an error so the panel can say so.
  const loadVariantDetail = useCallback((variantName) => {
    if (!variantName) return
    setVariantDetails(prev => {
      if (prev[variantName]) return prev
      modelsApi.list({ term: variantName, items: VARIANT_DETAIL_SEARCH_ITEMS })
        .then(data => {
          const entry = (data?.models || []).find(m => (m.name || m.id) === variantName)
          setVariantDetails(p => ({ ...p, [variantName]: entry ? { entry } : { error: true } }))
        })
        .catch(() => setVariantDetails(p => ({ ...p, [variantName]: { error: true } })))
      return { ...prev, [variantName]: { loading: true } }
    })
  }, [])

  const handleInstall = async (modelId, variant) => {
    try {
      setInstalling(prev => new Map(prev).set(modelId, Date.now()))
      await modelsApi.install(modelId, variant)
    } catch (err) {
      addToast(t('errors.installFailed', { message: err.message }), 'error')
    }
  }

  // Clear local installing flags when operations finish (success or error)
  useEffect(() => {
    if (installing.size === 0) return
    setInstalling(prev => {
      const next = new Map(prev)
      let changed = false
      for (const [modelId, timestamp] of prev) {
        const hasActiveOp = operations.some(op =>
          op.name === modelId && !op.completed && !op.error
        )
        const hasCompletedOp = operations.some(op =>
          op.name === modelId && (op.completed || op.error)
        )
        const elapsed = Date.now() - timestamp
        // Remove if operation completed, or if >5s passed with no operation ever appearing
        if (hasCompletedOp || (!hasActiveOp && elapsed > 5000)) {
          next.delete(modelId)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [operations, installing.size])

  const isInstalling = (modelId) => {
    return installing.has(modelId) || operations.some(op =>
      op.name === modelId && !op.completed && !op.error
    )
  }

  const getOperationProgress = (modelId) => {
    const op = operations.find(o => o.name === modelId && !o.completed && !o.error)
    return op?.progress ?? 0
  }

  const fitsGpu = (vramBytes) => {
    if (!vramBytes || !totalGpuMemory) return null
    return vramBytes <= totalGpuMemory * 0.95
  }

  useEffect(() => {
    try {
      localStorage.setItem(FITS_FILTER_STORAGE_KEY, fitsFilter ? '1' : '0')
    } catch {
      // Ignore storage errors (e.g., private browsing restrictions).
    }
  }, [fitsFilter])

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_VARIANTS_STORAGE_KEY, collapseVariants ? 'on' : 'off')
    } catch {
      // Ignore storage errors (e.g., private browsing restrictions).
    }
  }, [collapseVariants])

  const visibleModels = models.filter((model) => {
    if (!fitsFilter) return true
    const name = model.name || model.id
    const vramBytes = estimates[name]?.estimates?.[String(contextSize)]?.vramBytes
    const fit = fitsGpu(vramBytes)
    // Keep models visible while estimate is still loading; hide only explicit non-fits.
    return fit !== false
  })

  const selectedModel = selectedName
    ? visibleModels.find(m => (m.name || m.id) === selectedName) || null
    : null

  const toggleGroup = useCallback((id) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectModel = useCallback((name) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (name) next.set('model', name)
      else next.delete('model')
      return next
    // Returning to the shelves replaces the entry rather than pushing one, so
    // Back leaves the gallery instead of bouncing between the two pane states.
    }, { replace: !name })
    setExpandedFiles(false)
  }, [setSearchParams])

  const setInstalledQuery = useCallback(value => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      // `all` is a valid search term. Only an empty string clears q.
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setInstalledState = useCallback(value => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      // State alone reserves `all` as its default sentinel. q and model may
      // both name a literal installed model called "all".
      if (value && value !== 'all') next.set('state', value)
      else next.delete('state')
      return next
    })
  }, [setSearchParams])

  // The detail pane lists variants, so opening a model is the ask that pays for
  // the describe call. loadVariants is idempotent per name.
  useEffect(() => {
    if (selectedModel?.has_variants) loadVariants(selectedName)
  }, [selectedName, selectedModel, loadVariants])

  if (activeView === 'installed') {
    return (
      <div className="page page--wide page--app">
        <div className="view-bar">
          <h1 className="view-bar__title">{t('lifecycle.title')}</h1>
          <div className="view-bar__actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/app/model-editor', { state: fromState(location, t('lifecycle.title')) })}>
              <i className="fas fa-plus" /> {t('actions.addModel')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/app/import-model')}>
              <i className="fas fa-upload" /> {t('actions.importModel')}
            </button>
          </div>
        </div>
        <ModelsLifecycleNav activeView={activeView} searchParams={searchParams} t={t} />
        <InstalledModels
          addToast={addToast}
          query={urlSearch}
          state={installedState}
          selectedName={selectedName}
          onQueryChange={setInstalledQuery}
          onStateChange={setInstalledState}
          onSelect={selectModel}
        />
      </div>
    )
  }

  return (
    <div className="page page--wide page--app">
      {/* Title only. The two counts used to live here as well, which meant the
          screen stated "1,247 available" three times: once in this header, once
          as the rail's "9 of 1,247", and once in the pane's own headline. The
          rail and the pane are describing what you are looking at; the header
          was just repeating them from a distance. */}
      <div className="view-bar">
        <h1 className="view-bar__title">{t('lifecycle.title')}</h1>
        <span className="view-bar__count">{t('rail.showingCount', { shown: visibleModels.length, total: stats.total })}</span>
        <div className="view-bar__actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/app/model-editor', { state: fromState(location, t('models')) })}>
            <i className="fas fa-plus" /> {t('actions.addModel')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/app/import-model')}>
            <i className="fas fa-upload" /> {t('actions.importModel')}
          </button>
        </div>
      </div>

      <ModelsLifecycleNav activeView={activeView} searchParams={searchParams} t={t} />

      {/* Two columns. The left is the "Refine + your context" band: every
          control that narrows what the rail answers with, named so because its
          second job is to describe the context the size estimates are measured
          at. The right is the gallery reshaped as a host + cards split: the
          rail lists what this host can serve, and the pane is either the
          discovery cards or a model's detail. The band owns its own column (and
          its own scroller) instead of sharing the rail's, which is what lets
          the use-case chips be chips again rather than a stated-then-revealed
          popover.
          Bands stay in order:
          1. Query scope: free-text search plus the backend select. The backend
             select leads the taxonomy because picking a backend disables the
             use-cases that backend cannot serve (see isFilterAvailable), so it
             reads as the gate on what follows.
          2. Taxonomy: the use-case chips, grouped into the families the rest of
             the UI speaks.
          3. Refinements: the collapse, fits-in-GPU and CPU-only cuts plus the
             context size the VRAM estimates are computed at. All three narrow a
             listing the user is already reading rather than naming what to look
             at; fits and context are one group because the length is exactly
             what the fits filter tests against.
          Each band owns its container, so how many chips happen to wrap at a
          given width can no longer decide where the other controls land. */}
      {loading && !loadedOnce.current ? (
        <GalleryLoader />
      ) : (
      <div className="models-workspace" data-testid="discover">
        <aside className="models-refine models-filters" aria-label={t('filters.refineBand')}>
          <div className="models-refine__head">
            <i className="fas fa-sliders models-refine__head-icon" aria-hidden="true" />
            <h2 className="models-refine__title">{t('filters.refineBand')}</h2>
          </div>

          <section className="models-refine__section models-refine__query" aria-label={t('filters.queryScope')}>
            <div className="search-bar filter-bar-group__search models-refine__search">
              <i className="fas fa-search search-icon" aria-hidden="true" />
              <input
                className="input"
                type="text"
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            {allBackends.length > 0 && (
              <div className="models-filters__backend">
                <SearchableSelect
                  value={backendFilter}
                  onChange={(v) => { setBackendFilter(v); setPage(1) }}
                  options={allBackends}
                  placeholder={t('filters.allBackends')}
                  allOption={t('filters.allBackends')}
                  searchPlaceholder={t('filters.searchBackends')}
                />
              </div>
            )}
          </section>

          <section className="models-refine__section models-refine__taxonomy" aria-label={t('filters.useCaseLabel')}>
            <span className="models-refine__section-label">{t('filters.useCaseLabel')}</span>
            {FILTER_SECTIONS.map(section => {
              const inSection = FILTERS.filter(f => section.keys.includes(f.key))
              if (inSection.length === 0) return null
              return (
                <div className="models-filters__usecase-group" key={section.id}>
                  {section.labelKey && (
                    <span className="models-filters__usecase-label">{t(section.labelKey)}</span>
                  )}
                  <div className="filter-bar">
                    {inSection.map(f => {
                      const isAll = f.key === ''
                      const active = isAll ? filters.length === 0 : filters.includes(f.key)
                      const available = isFilterAvailable(f.key)
                      return (
                        <button
                          key={f.key}
                          type="button"
                          className={`filter-btn ${active ? 'active' : ''}`}
                          disabled={!available}
                          aria-pressed={active}
                          title={!available ? t('filters.unavailableForBackend') : undefined}
                          onClick={() => toggleFilter(f.key)}
                        >
                          <i className={`fas ${f.icon}`} aria-hidden="true" />
                          {t(f.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          <section className="models-refine__section models-refine__refine" data-testid="models-filters-refine" aria-label={t('filters.refineLabel')}>
            <span className="models-refine__section-label">{t('filters.refineLabel')}</span>
            {/* Leads the refinements because it decides how many rows the other
                two refine over, and because unlike fits-in-GPU it is always
                present: a host with no GPU still browses builds. Turning it off
                is the only way to page through every build the gallery holds;
                searching reaches a specific one but cannot enumerate them. */}
            <label className="filter-bar-group__toggle" data-testid="models-collapse-variants">
              <Toggle
                checked={collapseVariants}
                onChange={(v) => { setCollapseVariants(v); setPage(1) }}
              />
              <i className="fas fa-layer-group" aria-hidden="true" />
              <span>{t('filters.collapseVariants')}</span>
            </label>
            {totalGpuMemory > 0 && (
              <label className="filter-bar-group__toggle">
                <Toggle checked={fitsFilter} onChange={setFitsFilter} />
                <i className="fas fa-microchip" aria-hidden="true" />
                <span>{t('filters.fitsGpu')}</span>
              </label>
            )}
            {/* A host without a GPU still browses, and this is the only fit
                verdict that is never false there: something the rail marks
                runs_on_cpu can always be served as builds go. It sends the
                capability filter (capability=cpu) the handler matches against
                every build the gallery holds, widening a picked backend rather
                than standing in for one. */}
            <label className="filter-bar-group__toggle">
              <Toggle checked={cpuOnlyFilter} onChange={(v) => { setCpuOnlyFilter(v); setPage(1) }} />
              <i className="fas fa-microchip" aria-hidden="true" />
              <span>{t('filters.onlyCpu')}</span>
            </label>
            <div className="models-filters__context">
              <label htmlFor="models-context-size">
                <i className="fas fa-memory" aria-hidden="true" />
                {t('filters.contextSize')}
              </label>
              <input
                id="models-context-size"
                type="range"
                min={0}
                max={CONTEXT_SIZES.length - 1}
                value={CONTEXT_SIZES.indexOf(contextSize)}
                // The slider steps over an index, so the raw value ("2") is
                // meaningless to a screen reader; announce the size instead.
                aria-valuetext={CONTEXT_LABELS[CONTEXT_SIZES.indexOf(contextSize)]}
                onChange={(e) => setContextSize(CONTEXT_SIZES[e.target.value])}
              />
              <span className="models-filters__context-value">
                {CONTEXT_LABELS[CONTEXT_SIZES.indexOf(contextSize)]}
              </span>
            </div>
          </section>

          {/* The band owns every control, so the reset lives with them rather
              than waiting for the empty state. It appears the moment anything
              the band touches is not at its default. */}
          {(search || filters.length > 0 || backendFilter || fitsFilter || cpuOnlyFilter || !collapseVariants) && (
            <button
              className="btn btn-secondary btn-sm models-refine__clear"
              onClick={() => { handleSearch(''); setFilters([]); setBackendFilter(''); setCpuOnlyFilter(false); setFitsFilter(false); setCollapseVariants(COLLAPSE_VARIANTS_DEFAULT); setPage(1) }}
            >
              <i className="fas fa-times" /> {t('search.clearFilters')}
            </button>
          )}
        </aside>

{/* Three columns, each owning its own scroller. The refine band is
          unchanged on the left; the centre is the rail plus the compact
          download strip at its foot; the right is the pane, which answers for
          one model or, at nothing, says what this host can serve. The two
          split-view classes on the centre and right keep the rail-scrolls /
          pseudo-scrolls contract the old SplitView shell carried. */}
        <div className="split-view__rail-col">
              {/* Grouped while browsing, flat while searching: once a term is
                  typed the buckets stand between the reader and the answer. */}
              <EntityRail
                items={visibleModels.map(m => railItemFor(m, { estimates, pendingEstimates, contextSize, fitsGpu, isInstalling, getOperationProgress, cpuOnly: cpuOnlyFilter, execCpu: isExecCpu(m.name || m.id), t }))}
                groups={ENTITY_GROUPS.map(g => ({ id: g.id, label: t(g.labelKey), icon: g.icon }))}
                grouped={!search.trim()}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
                busy={loading}
                selectedId={selectedName}
                onSelect={selectModel}
                countLabel={t('rail.showingCount', { shown: visibleModels.length, total: stats.total })}
                ariaLabel={t('title')}
                testId="discover-rail"
                actions={
                  <div className="entity-rail__sort" role="group" aria-label={t('rail.sortLabel')}>
                    <SortButton col="name" label={t('table.modelName')} sort={sort} order={order} onSort={handleSort} />
                    <SortButton col="status" label={t('table.status')} sort={sort} order={order} onSort={handleSort} />
                  </div>
                }
              />

              {totalPages > 1 && (
                <div className="pagination split-view__pager">
                  <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label={t('rail.previousPage')}>
                    <i className="fas fa-chevron-left" />
                  </button>
                  <span className="split-view__pager-label">{page} / {totalPages}</span>
                  <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label={t('rail.nextPage')}>
                    <i className="fas fa-chevron-right" />
                  </button>
                </div>
              )}

              <ModelsDownloads
                operations={operations}
                cancelOperation={cancelOperation}
                pauseOperation={pauseOperation}
                t={t}
              />
            </div>

            <div className="split-view__pane" data-testid="discover-pane">
            {visibleModels.length === 0 ? (
    <div className="empty-state">
              <div className="empty-state-icon"><i className="fas fa-search" /></div>
              <h2 className="empty-state-title">{t('empty.title')}</h2>
              <p className="empty-state-text">
                {search || filters.length > 0 || backendFilter || fitsFilter || !collapseVariants ? t('empty.withFilters') : t('empty.noFilters')}
              </p>
              {/* Only the fits filter can leave the collapse to blame. The term,
                  the chips and the backend are applied server-side over every build
                  the gallery holds, and a match there is always reported as some
                  row, so those three can no longer come back empty on account of
                  the collapse. Fits runs here in the browser, after the server
                  substituted a matching build for the entry that offers it, and
                  judges that entry's own size: the build that fits can still be
                  filtered out along with a parent that does not. */}
{collapseVariants && fitsFilter && (
                <p className="empty-state-hint">{t('empty.collapsedVariantsHint')}</p>
              )}
            </div>
            ) : selectedModel ? (
              <DiscoverDetail
                model={selectedModel}
                estimate={estimates[selectedName]}
                contextSize={contextSize}
                onPickContext={setContextSize}
                totalGpuMemory={totalGpuMemory}
                fitsGpu={fitsGpu}
                budgetNode={budget.scope === 'cluster' ? budget.nodeName : ''}
                installing={isInstalling(selectedName)}
                progress={getOperationProgress(selectedName)}
                onInstall={handleInstall}
                installedProfile={installedProfiles[selectedName]}
                onOpen={route => navigate(route)}
                onManage={name => setSearchParams(previous => {
                  const next = new URLSearchParams(previous)
                  next.set('view', 'installed')
                  next.set('model', name)
                  return next
                })}
                onBack={() => selectModel(null)}
                expandedFiles={expandedFiles}
                setExpandedFiles={setExpandedFiles}
                variantData={selectedModel.has_variants ? variantData[selectedName] : null}
                variantDetails={variantDetails}
                onLoadVariantDetail={loadVariantDetail}
                cpuMode={isExecCpu(selectedName)}
                runsOnCpu={!!selectedModel.runs_on_cpu}
                onToggleCpuMode={(v) => setExecCpu(selectedName, v)}
                t={t}
              />
            ) : (
              <div className="zero-pane">
                <div className="zero-pane__hero">
                  <span className="zero-pane__eyebrow">{t('shelves.hostLabel')}</span>
                  <h2 className="zero-pane__title">
                    {/* The resources endpoint reports system RAM when there is
                        no accelerator, so calling it "GPU memory" was a claim
                        the data did not support. */}
                    {totalGpuMemory <= 0
                      ? t('shelves.heroNoGpu', { count: stats.total })
                      : budget.scope === 'cluster'
                        // Naming the node is the point: a cluster figure with
                        // no owner reads as this machine's, which is the very
                        // confusion the cluster reading exists to end.
                        ? t(budget.nodeCount > 1 ? 'shelves.heroWithCluster' : 'shelves.heroWithNode', {
                          vram: formatBytes(totalGpuMemory), node: budget.nodeName, nodes: budget.nodeCount, count: stats.total,
                        })
                        : hasGpu
                          ? t('shelves.heroWithGpu', { vram: formatBytes(totalGpuMemory), count: stats.total })
                          : t('shelves.heroWithRam', { ram: formatBytes(totalGpuMemory), count: stats.total })}
                  </h2>
                  <p className="zero-pane__text">{t('shelves.heroHint')}</p>
                </div>

                {/* The pane's own answer to "what am I running on". Read from
                    /api/resources: what the backend actually measured, never a
                    number this page guessed. */}
                <YourHost resources={resources} stats={stats} statsLoaded={statsLoaded} t={t} />

                {/* How much of the models filesystem is spoken for. Every cell
                    is a real reported figure; what the host does not separate
                    is said so rather than invented. */}
                <DiskUsage resources={resources} t={t} />

                {/* The hardware-fit strip is the curation, and here it finally
                    gets the width to argue for a model rather than list one.
                    It keeps its own dismissal and collapse state, so someone
                    who closed it still lands on the pane below. */}
                <RecommendedModels addToast={addToast} />

                {/* Somewhere to start when the recommendations are not it.
                    These set the use-case filter rather than fetching a second
                    list, so a shelf costs nothing and cannot go stale. */}
                <div className="zero-pane__shelf">
                  <div className="zero-pane__shelf-head">
                    <h3 className="zero-pane__shelf-title">{t('shelves.byUseCase')}</h3>
                  </div>
                  {/* Lanes, not tiles. These are a list of ways in, read in
                      order — a grid of equal cards asks the reader to compare
                      them, which is not the choice being offered. */}
                  <ul className="lanes lanes--usecase">
                    {FILTER_SECTIONS.filter(sec => sec.pick).map(sec => (
                      <li key={sec.id}>
                        <button
                          type="button"
                          className="lane"
                          onClick={() => { setFilters([sec.pick]); setPage(1) }}
                        >
                          <span className="lane__tag">
                            <i className={`fas ${sec.icon}`} aria-hidden="true" /> {t(sec.labelKey)}
                          </span>
                          <span className="lane__desc">{t(sec.blurbKey)}</span>
                          <span className="lane__go" aria-hidden="true">→</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
      </div>
      )}

    </div>
  )
}

// ModelsDownloads is the compact strip at the foot of the rail: every active
// model install the backend reports, with a progress bar, bytes, and the same
// pause/cancel controls the Activity page carries. It exists because an install
// starts from this page and the only feedback used to be the global strip at
// the bottom of the shell; here the download sits in the column it started in.
function ModelsDownloads({ operations, cancelOperation, pauseOperation, t }) {
  const active = (operations || []).filter(op => !op.isBackend && !op.completed && !op.error)
  if (active.length === 0) return null

  return (
    <div className="models-downloads" data-testid="models-downloads">
      <div className="models-downloads__head">
        <span className="models-refine__section-label">{t('downloads.heading')}</span>
        <span className="entity-rail__count">{active.length}</span>
      </div>

      {active.map(op => {
        const name = op.name || op.id || op.jobID
        const hasBytes = Number.isFinite(op.currentBytes) && Number.isFinite(op.totalBytes) && op.totalBytes > 0
        const bytes = hasBytes ? `${formatBytes(op.currentBytes)} / ${formatBytes(op.totalBytes)}` : ''
        const rate = Number.isFinite(op.bytesPerSecond) && op.bytesPerSecond > 0
          ? ` · ${formatBytes(op.bytesPerSecond)}/s`
          : ''
        const pct = Math.round(op.progress || 0)
        const showProgress = !op.isQueued && Number.isFinite(op.progress) && op.progress > 0
        return (
          <div className="models-downloads__item" key={op.jobID || op.id || name}>
            <span className="operations-strip__name" title={name}>{name}</span>
            <span className="operations-strip__detail">
              {op.isQueued ? t('downloads.queued') : t('downloads.installing')}
            </span>
            {showProgress ? (
              <span
                className="operations-strip__track"
                role="progressbar"
                aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                aria-label={t('downloads.progressLabel', { name })}
              >
                <span className="operations-strip__fill" style={{ width: `${op.progress}%` }} />
              </span>
            ) : null}
            {showProgress && hasBytes ? (
              <span className="operations-strip__bytes">{bytes}{rate}</span>
            ) : hasBytes ? (
              <span className="operations-strip__bytes">{bytes}{rate}</span>
            ) : null}
            {op.cancellable && !op.error && (
              <span className="models-downloads__actions">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  title={t('downloads.pause')}
                  aria-label={t('downloads.pauseLabel', { name })}
                  onClick={() => pauseOperation?.(op.jobID)}
                >
                  <i className="fas fa-pause" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  title={t('downloads.cancel')}
                  aria-label={t('downloads.cancelLabel', { name })}
                  onClick={() => cancelOperation?.(op.jobID)}
                >
                  <i className="fas fa-xmark" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// YourHost is the hardware answer built from /api/resources: the type of host
// (accelerator or CPU-only - decided by the backend's own type field), real
// RAM, real VRAM per detected GPU, and the gallery's available-model count.
// Everything is a reported number; what the endpoint does not say is left out.
// The meters reuse the resource-monitor chrome but in neutral grey - the
// colored verdict envelope is reserved for accusation, and hardware is not an
// accusation.
function YourHost({ resources, stats, statsLoaded, t }) {
  if (!resources || resources.available === false) return null
  const gpus = resources.gpus || []
  const isGpu = resources.type === 'gpu' && gpus.length > 0
  const ram = resources.ram || {}
  const neutral = 'var(--color-secondary)'
  const hasStats = statsLoaded && Number.isFinite(stats?.total)

  return (
    <section className="resource-monitor" data-testid="models-your-host">
      <div className="hstack hstack--between mb-sm">
        <h3 className="m-0" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          <i className="fas fa-server" aria-hidden="true" /> {t('host.title')}
        </h3>
        <span className="entity-rail__badge">{isGpu ? t('host.gpuHost') : t('host.cpuHost')}</span>
      </div>

      {gpus.length > 0 && gpus.map((gpu, i) => {
        const pct = gpu.usage_percent || 0
        return (
          <div className="resource-gpu-card" key={gpu.bdf || i}>
            <div className="resource-gpu-header">
              <span className="resource-gpu-name resource-gpu-name--truncate">{gpu.name || `GPU ${i + 1}`}</span>
              {gpu.vendor && <span className="resource-gpu-vendor resource-gpu-vendor--memory">{gpu.vendor}</span>}
            </div>
            <div className="resource-meter">
              <div className="resource-bar-container flex-1">
                <div className="resource-bar" style={{ '--resource-width': `${pct}%`, '--resource-color': neutral }} />
              </div>
              <span className="resource-meter__value" style={{ '--resource-color': neutral }}>{pct.toFixed(0)}%</span>
            </div>
            <div className="resource-gpu-stats">
              <span>{t('host.used')}: {formatBytes(gpu.used_vram)}</span>
              <span>{t('host.total')}: {formatBytes(gpu.total_vram)}</span>
            </div>
          </div>
        )
      })}

      {ram.total != null || ram.used != null ? (
        <div className="resource-gpu-card">
          <div className="resource-gpu-header">
            <span className="resource-gpu-name">{t('host.systemRam')}</span>
            <span className="resource-gpu-vendor resource-gpu-vendor--memory">
              {t('host.available')}: {formatBytes(ram.available ?? ram.used ?? 0)}
            </span>
          </div>
          <div className="resource-meter">
            <div className="resource-bar-container flex-1">
              <div className="resource-bar" style={{ '--resource-width': `${ram.usage_percent || 0}%`, '--resource-color': neutral }} />
            </div>
            <span className="resource-meter__value" style={{ '--resource-color': neutral }}>{(ram.usage_percent || 0).toFixed(0)}%</span>
          </div>
          <div className="resource-gpu-stats">
            <span>{t('host.used')}: {formatBytes(ram.used ?? 0)}</span>
            <span>{t('host.total')}: {formatBytes(ram.total ?? 0)}</span>
          </div>
        </div>
      ) : null}

      {hasStats && (
        <div className="resource-summary-row">
          <span>{t('host.modelsInGallery')}</span>
          <span className="resource-summary-row__value">{stats.total.toLocaleString()}</span>
        </div>
      )}
      {resources.storage_size != null && (
        <div className="resource-summary-row">
          <span>{t('host.modelsOnDisk')}</span>
          <span className="resource-summary-row__value">{formatBytes(resources.storage_size)}</span>
        </div>
      )}
    </section>
  )
}

// DiskUsage says how much of the models filesystem is used. Only the models
// store size is reported by /api/resources; backend and cache stores live in
// paths the endpoint does not enumerate, and free space is not reported at all
// on this host. Saying "—" with a note is honest; a guessed number is not.
function DiskUsage({ resources, t }) {
  if (!resources || resources.available === false) return null
  const storage = resources.storage_size != null ? formatBytes(resources.storage_size) : null

  return (
    <section className="resource-monitor" data-testid="models-disk">
      <h3 className="m-0 mb-sm" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
        <i className="fas fa-database" aria-hidden="true" /> {t('disk.title')}
      </h3>
      <div className="resource-summary-row">
        <span>{t('disk.models')}</span>
        <span className="resource-summary-row__value">{storage ?? '—'}</span>
      </div>
      <div className="resource-summary-row">
        <span>{t('disk.backends')}</span>
        <span className="resource-summary-row__value" aria-label={t('disk.unreported')}>—</span>
      </div>
      <div className="resource-summary-row">
        <span>{t('disk.cache')}</span>
        <span className="resource-summary-row__value" aria-label={t('disk.unreported')}>—</span>
      </div>
      <div className="resource-summary-row">
        <span>{t('disk.free')}</span>
        <span className="resource-summary-row__value" aria-label={t('disk.unreported')}>—</span>
      </div>
      <p className="zero-pane__text" style={{ marginTop: 'var(--spacing-sm)', marginBottom: 0 }}>
        {t('disk.unreportedNote')}
      </p>
    </section>
  )
}

// variantSizeLabel renders a variant footprint. memory_bytes is omitempty on
// the wire, so an absent key means the probe could not determine a size; it
// must never render as "0 B", which would read as "needs nothing".
function variantSizeLabel(variant, t) {
  return variant?.memory_bytes ? formatBytes(variant.memory_bytes) : t('variants.unknownSize')
}

// variantFeatureLabel spells out a serving feature.
//
// The vocabulary is short and curated server-side, so each token has a real
// translated name. An unrecognised one still renders as its uppercased token
// rather than being dropped: the server's list can grow ahead of the locale
// files, and a missing string is a worse outcome than an untranslated one when
// the alternative is silently hiding a genuine reason to pick a build.
function variantFeatureLabel(feature, t) {
  return t(`variants.features.${feature}`, { defaultValue: feature.toUpperCase() })
}

function DetailRow({ label, children }) {
  if (!children) return null
  return (
    <tr>
      <td style={{ fontWeight: 500, fontSize: '0.8125rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', verticalAlign: 'top', padding: '6px 12px 6px 0' }}>
        {label}
      </td>
      <td style={{ fontSize: '0.8125rem', padding: '6px 0' }}>{children}</td>
    </tr>
  )
}

// VariantDetailPanel is the same detail view a top-level row gets, rendered for
// one variant.
//
// It reuses ModelDetail rather than restating what an entry looks like, so a
// field added to the detail view appears here too. variantData is deliberately
// withheld: a variant's own entry may declare variants of its own, and
// recursing would nest a picker inside a picker two levels deep already. The
// file disclosure gets its own state here because each panel opens and closes
// independently of the parent's.
function VariantDetailPanel({ model, t }) {
  const [expandedFiles, setExpandedFiles] = useState(false)
  return (
    <ModelDetail
      model={model}
      nested
      expandedFiles={expandedFiles}
      setExpandedFiles={setExpandedFiles}
      variantData={null}
      t={t}
    />
  )
}

function ModelDetail({ model, fit, sizeDisplay, vramDisplay, expandedFiles, setExpandedFiles, variantData, variantDetails, onLoadVariantDetail, installing, onInstall, nested, t }) {
  const files = model.additionalFiles || model.files || []
  const name = model.name || model.id
  // Which variant has its details revealed, or null. One at a time: the list is
  // a comparison, and two open panels push the rows being compared apart.
  const [openVariant, setOpenVariant] = useState(null)
  // Escape returns focus to the control that opened the panel, so dismissing by
  // keyboard does not drop the user back at the top of the document.
  const infoRefs = useRef({})
  return (
    <div style={{
      padding: 'var(--spacing-md) var(--spacing-lg)',
      background: nested ? 'transparent' : 'var(--color-bg-primary)',
      borderTop: nested ? 'none' : '1px solid var(--color-border-subtle)',
    }}>
      {model.description && (
        // Prose sits outside the label/value table: an eight-line value cell
        // in a grid of one-line ones breaks the rhythm exactly where the eye
        // enters, and the full pane width is roughly double a readable measure.
        <div className="detail-prose">
          <div className="detail-prose__label">{t('detail.description')}</div>
          <div
            className="markdown-body detail-prose__body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(model.description) }}
          />
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <DetailRow label={t('detail.gallery')}>
            {model.gallery && (
              <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                {typeof model.gallery === 'string' ? model.gallery : model.gallery.name || '—'}
              </span>
            )}
          </DetailRow>
          <DetailRow label={t('detail.backend')}>
            {model.backend && (
              <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                {model.backend}
              </span>
            )}
          </DetailRow>
          <DetailRow label={t('detail.size')}>
            {sizeDisplay && sizeDisplay !== '0 B' ? sizeDisplay : null}
          </DetailRow>
          <DetailRow label={t('detail.vram')}>
            {vramDisplay && vramDisplay !== '0 B' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                {vramDisplay}
                {fit !== null && (
                  <span style={{ fontSize: '0.75rem', color: fit ? 'var(--color-success)' : 'var(--color-error)' }}>
                    <i className="fas fa-microchip" /> {fit ? t('detail.fitsGpu') : t('detail.mayNotFitGpu')}
                  </span>
                )}
              </span>
            ) : null}
          </DetailRow>
          {variantData?.loading && (
            <DetailRow label={t('variants.title')}>
              <span style={{ color: 'var(--color-text-muted)' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />{t('variants.loading')}
              </span>
            </DetailRow>
          )}
          {variantData?.variants?.length > 0 && (
            <DetailRow label={t('variants.title')}>
              <div className="variant-list">
                {variantData.variants.map(v => {
                  const isAuto = v.model === variantData.auto_selected
                  const detail = variantDetails?.[v.model]
                  const detailOpen = openVariant === v.model
                  const panelId = `variant-detail-${v.model}`
                  return (
                    <div
                      key={v.model}
                      className="variant-entry"
                      onKeyDown={(e) => {
                        if (e.key !== 'Escape' || !detailOpen) return
                        // Stops the row's own expansion, and any dialog above
                        // it, from also closing on the same keystroke.
                        e.stopPropagation()
                        setOpenVariant(null)
                        infoRefs.current[v.model]?.focus()
                      }}
                    >
                    {/* A separate control, not a region of the install button:
                        nesting it would be invalid markup and, worse, would
                        make "tell me more" a click on "install this". It leads
                        the row because it acts on the name that follows it. */}
                    <button
                      type="button"
                      ref={(el) => { infoRefs.current[v.model] = el }}
                      className="variant-row__info"
                      aria-expanded={detailOpen}
                      aria-controls={detailOpen ? panelId : undefined}
                      // Named after the build it describes: a column of
                      // identical "Details" buttons tells a screen reader
                      // user nothing about which row they are on.
                      aria-label={detailOpen
                        ? t('variants.hideDetails', { variant: v.model })
                        : t('variants.showDetails', { variant: v.model })}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (detailOpen) { setOpenVariant(null); return }
                        setOpenVariant(v.model)
                        onLoadVariantDetail?.(v.model)
                      }}
                    >
                      <i className="fas fa-circle-info" aria-hidden="true" />
                    </button>
                    {/* Listing the alternatives without offering them made the
                        detail view read as a menu that could not be ordered
                        from; installing one is the same call the split-button
                        chevron already makes. */}
                    <button
                      type="button"
                      className={`variant-row${v.fits ? '' : ' variant-row--unfit'}`}
                      disabled={installing}
                      aria-label={t('variants.installVariant', { variant: v.model })}
                      onClick={(e) => { e.stopPropagation(); onInstall(name, v.model) }}
                    >
                      <span className="variant-row__name">{v.model}</span>
                      <span className="variant-row__backend">{v.backend || t('variants.unknownBackend')}</span>
                      {/* Its own column rather than appended to the backend
                          cell, so precision lines up down the list and two
                          builds can be compared by scanning rather than by
                          reading. An entry naming no weight format says so:
                          an empty cell in an aligned column reads as a
                          rendering fault. */}
                      <span
                        className={`variant-row__quant${v.quantization ? '' : ' variant-row__quant--unknown'}`}
                        title={t('variants.quantizationTitle')}
                      >
                        {v.quantization || t('variants.unknownQuantization')}
                      </span>
                      <span className="variant-row__size">{variantSizeLabel(v, t)}</span>
                      <span className="variant-row__status">
                        {isAuto && (
                          <span className="badge badge-success">
                            <i className="fas fa-circle-check" /> {t('variants.autoSelected')}
                          </span>
                        )}
                        {!v.fits && <span className="badge badge-warning">{t('variants.doesNotFit')}</span>}
                        {v.is_base && !isAuto && <span className="badge badge-info">{t('variants.base')}</span>}
                        {/* The room the detail row has over the dropdown is
                            spent here: "DFLASH" names nothing to a user who
                            has not met it, whereas the spelled-out feature
                            says why this build is worth choosing. */}
                        {(v.features || []).map(f => (
                          <span key={f} className="badge badge-info">
                            <i className="fas fa-bolt" aria-hidden="true" /> {variantFeatureLabel(f, t)}
                          </span>
                        ))}
                      </span>
                      <i className="fas fa-download variant-row__action" aria-hidden="true" />
                    </button>
                    {detailOpen && (
                      // An inline disclosure rather than a modal. This is
                      // already inside an expanded row, and a dialog opened
                      // from there stacks a dismissal on top of a dismissal
                      // for what is a few more lines of the same entry. The
                      // rule and inset carry the third level instead.
                      <div className="variant-detail" id={panelId}>
                        {(!detail || detail.loading) && (
                          <div className="variant-detail__state">
                            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                            <span>{t('variants.detailsLoading')}</span>
                          </div>
                        )}
                        {detail?.error && (
                          // Stated, not blank: an empty panel reads as a
                          // rendering fault rather than as a lookup that
                          // failed.
                          <div className="variant-detail__state variant-detail__state--error" role="status">
                            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                            <span>{t('variants.detailsUnavailable', { variant: v.model })}</span>
                          </div>
                        )}
                        {detail?.entry && <VariantDetailPanel model={detail.entry} t={t} />}
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
            </DetailRow>
          )}
          <DetailRow label={t('detail.license')}>
            {model.license && <span>{model.license}</span>}
          </DetailRow>
          <DetailRow label={t('detail.tags')}>
            {model.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
                {model.tags.map(tag => (
                  <span key={tag} className="badge badge-info" style={{ fontSize: '0.6875rem' }}>{tag}</span>
                ))}
              </div>
            )}
          </DetailRow>
          <DetailRow label={t('detail.links')}>
            {model.urls?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {model.urls.map((url, i) => (
                  <a key={i} href={safeHref(url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', wordBreak: 'break-all' }}>
                    <i className="fas fa-external-link-alt" style={{ marginRight: 4, fontSize: '0.6875rem' }} />{url}
                  </a>
                ))}
              </div>
            )}
          </DetailRow>
          {model.trustRemoteCode && (
            <DetailRow label={t('detail.warning')}>
              <span className="badge badge-error" style={{ fontSize: '0.6875rem' }}>
                <i className="fas fa-circle-exclamation" /> {t('detail.requiresTrustRemoteCode')}
              </span>
            </DetailRow>
          )}
          {files.length > 0 && (
            <DetailRow label={t('detail.files')}>
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => { e.stopPropagation(); setExpandedFiles(!expandedFiles) }}
                  style={{ marginBottom: expandedFiles ? 'var(--spacing-sm)' : 0 }}
                >
                  <i className={`fas fa-chevron-${expandedFiles ? 'down' : 'right'}`} style={{ fontSize: '0.5rem', marginRight: 4 }} />
                  {t('detail.fileCount', { count: files.length })}
                </button>
                {expandedFiles && (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg-tertiary)' }}>
                          <th style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', textAlign: 'left', fontWeight: 500 }}>{t('detail.filename')}</th>
                          <th style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', textAlign: 'left', fontWeight: 500 }}>{t('detail.uri')}</th>
                          <th style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', textAlign: 'left', fontWeight: 500 }}>{t('detail.sha256')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                            <td style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontFamily: 'var(--font-mono)' }}>{f.filename || '—'}</td>
                            <td style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', wordBreak: 'break-all', maxWidth: 300 }}>{f.uri || '—'}</td>
                            <td style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                              {f.sha256 ? f.sha256.substring(0, 16) + '...' : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </DetailRow>
          )}
        </tbody>
      </table>
    </div>
  )
}

// railItemFor maps a gallery entry onto the shape EntityRail speaks. Keeping
// the vocabulary translation here, rather than teaching the rail about models,
// is what lets Models and Backends reuse the same component without two
// slightly different rails growing out of it.
//
// The rail line gets exactly one fact beyond the name, and it is spent on
// whether the thing will run here. Descriptions belong in the pane; two lines
// is the budget and the second one is worth more as an answer than as prose.
//
// In a CPU frame (the Only CPU cut, or a model the operator pinned to CPU-only)
// there is no GPU to fit into, so the verdict becomes the footprint itself and
// the host's VRAM has nothing to say about it.
function railItemFor(model, { estimates, pendingEstimates, contextSize, fitsGpu, isInstalling, getOperationProgress, cpuOnly, execCpu, t }) {
  const name = model.name || model.id
  const est = estimates[name]
  const sizeDisplay = est?.sizeDisplay
  const vramBytes = est?.estimates?.[String(contextSize)]?.vramBytes
  const cpuFrame = cpuOnly || execCpu
  const fit = cpuFrame ? null : fitsGpu(vramBytes)
  const hasSize = sizeDisplay && sizeDisplay !== '0 B'
  const installing = isInstalling(name)
  const progress = getOperationProgress(name)

  let meta = model.backend || ''
  let metaTone
  if (installing) {
    meta = progress > 0 ? t('rail.downloadingPct', { percent: Math.round(progress) }) : t('table.installing')
    metaTone = 'busy'
  } else if (model.installed) {
    meta = t('table.installed')
    metaTone = 'ok'
  } else if (cpuFrame && hasSize) {
    // How much system RAM the build will live in, with no GPU verdict to mute.
    meta = t('rail.cpuSize', { size: sizeDisplay })
  } else if (hasSize && fit === false) {
    meta = t('rail.tooLarge', { size: sizeDisplay })
    metaTone = 'bad'
  } else if (hasSize && fit === true) {
    meta = t('rail.fitsSize', { size: sizeDisplay })
  } else if (hasSize) {
    meta = sizeDisplay
  } else if (pendingEstimates?.has(name)) {
    // Say the size is coming rather than leaving the line to fill in silently.
    // The row is usable now; only the "will it fit" answer is still on its way.
    meta = t('rail.sizing')
    metaTone = 'pending'
  }

  return { id: name, name, icon: groupForEntity(model).icon, meta, metaTone, groupId: groupForEntity(model).id, badge: model.runs_on_cpu && !cpuOnly ? t('rail.runsOnCpu') : undefined }
}

// SortButton is the home sorting found after the column headers went. It sits
// in the rail rather than the filter band above, because it orders this list
// and nothing else on the page.
function SortButton({ col, label, sort, order, onSort }) {
  const active = sort === col
  return (
    <button
      type="button"
      className={`entity-rail__sort-btn${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={() => onSort(col)}
    >
      {label}
      {active && <i className={`fas fa-arrow-${order === 'asc' ? 'up' : 'down'}`} aria-hidden="true" />}
    </button>
  )
}

// VramByContext plots the estimate the fits filter actually tests against, at
// every context length the page asks the server for.
//
// It exists because a single number answers the wrong question. "Needs 6.2 GB"
// invites "so will it run?", and the honest answer is usually "yes, up to a
// 32k context" - which is a shape, not a number. The limit line is what makes
// the bars mean anything, so a host with no GPU gets no chart at all rather
// than a chart with nothing to compare against.
function VramByContext({ estimate, contextSize, onPickContext, totalGpuMemory, t }) {
  if (!(totalGpuMemory > 0)) return null
  const points = CONTEXT_SIZES
    .map((ctx, i) => ({ ctx, label: CONTEXT_LABELS[i], bytes: estimate?.estimates?.[String(ctx)]?.vramBytes || 0 }))
    .filter(p => p.bytes > 0)
  // One bar compares with nothing; the stat grid already states that number.
  if (points.length < 2) return null

  const limit = totalGpuMemory * 0.95
  const max = Math.max(limit, ...points.map(p => p.bytes)) * 1.12
  const over = points.filter(p => p.bytes > limit).length
  const lastFitting = points.reduce((acc, p) => (p.bytes <= limit ? p : acc), null)

  let verdictClass = 'ok'
  let verdict = t('chart.fitsEverywhere')
  if (over === points.length) {
    verdictClass = 'bad'
    verdict = t('chart.fitsNowhere')
  } else if (over > 0) {
    // Warn, however many sizes are over. A model that fits at 8k but not 32k is
    // a trade-off, not a fault, and it stays installable — reserving the error
    // tone for "fits nowhere" keeps that distinction legible.
    verdictClass = 'warn'
    verdict = t('chart.fitsUpTo', { context: lastFitting.label })
  }

  // Heights are resolved in pixels against a known plot height rather than as
  // percentages. A percentage would resolve against the column box, which also
  // holds the value label, so the tallest bars would overflow it.
  const track = CHART_HEIGHT - CHART_LABEL_ROOM

  return (
    <div className="discover__chart">
      <span className="discover__chart-title">{t('chart.title')}</span>
      <div className="discover__chart-plot">
        <div
          className="discover__chart-limit"
          style={{ '--discover-limit': `${(limit / max) * track}px` }}
        >
          <span className="discover__chart-limit-label">{t('chart.available', { vram: formatBytes(totalGpuMemory) })}</span>
        </div>
        {points.map(p => {
          const unfit = p.bytes > limit
          return (
            <button
              type="button"
              key={p.ctx}
              className={`discover__chart-col${p.ctx === contextSize ? ' discover__chart-col--on' : ''}`}
              aria-pressed={p.ctx === contextSize}
              // The bars read the context size out and set it: the slider in
              // the filter band writes the same value, and picking the length
              // you care about here is the same gesture as reading its bar.
              onClick={() => onPickContext(p.ctx)}
              title={t('chart.barTitle', { context: p.label, vram: formatBytes(p.bytes) })}
            >
              <span className="discover__chart-value">{formatBytes(p.bytes)}</span>
              <span
                className={`discover__chart-bar${unfit ? ' discover__chart-bar--over' : ''}`}
                style={{ '--discover-bar': `${(p.bytes / max) * track}px` }}
              />
            </button>
          )
        })}
      </div>
      {/* The axis is its own row so every column shares one baseline, which a
          label inside each column cannot guarantee once the values above them
          wrap differently. */}
      <div className="discover__chart-axis" aria-hidden="true">
        {points.map(p => (
          <span key={p.ctx} className={p.ctx === contextSize ? 'discover__chart-axis-on' : undefined}>{p.label}</span>
        ))}
      </div>
      <p className={`discover__chart-verdict discover__chart-verdict--${verdictClass}`}>
        <i className="fas fa-microchip" aria-hidden="true" /> {verdict}
      </p>
    </div>
  )
}

// DiscoverDetail is the pane with a model selected. It owns the part a table
// row could not hold - the headline numbers, the VRAM curve and the actions -
// and hands the rest to ModelDetail, which already knows how to render an
// entry's fields and is shared with the per-variant panel.
function DiscoverDetail({
  model, estimate, contextSize, onPickContext, totalGpuMemory, fitsGpu, budgetNode,
  installing, progress, onInstall, installedProfile, onOpen, onManage, onBack,
  expandedFiles, setExpandedFiles, variantData, variantDetails, onLoadVariantDetail,
  cpuMode, runsOnCpu, onToggleCpuMode, t,
}) {
  const name = model.name || model.id
  const sizeDisplay = estimate?.sizeDisplay
  const vramBytes = estimate?.estimates?.[String(contextSize)]?.vramBytes
  const fit = cpuMode ? null : fitsGpu(vramBytes)
  const contextLabel = CONTEXT_LABELS[CONTEXT_SIZES.indexOf(contextSize)]
  const headroom = cpuMode ? null : (totalGpuMemory > 0 && vramBytes ? totalGpuMemory * 0.95 - vramBytes : null)
  const openUseCase = modelUseCases(installedProfile).find(useCase => useCase.route)

  return (
    <ModelLifecycleDetailShell
      testId="discover"
      icon={groupForEntity(model).icon}
      name={name}
      lede={model.description ? stripMarkdown(model.description).slice(0, 220) : null}
      ledeTitle={model.description ? stripMarkdown(model.description) : null}
      onBack={onBack}
      backLabel={t('detail.backToAll')}
      warning={model.trustRemoteCode ? t('detail.requiresTrustRemoteCode') : null}
      actions={
          installing ? (
            <div className="inline-install">
              <div className="inline-install__row">
                <div className="operation-spinner" />
                <span className="inline-install__label">
                  {progress > 0 ? t('table.installingPct', { percent: Math.round(progress) }) : `${t('table.installing')}...`}
                </span>
              </div>
              {progress > 0 && (
                <div className="operation-bar-container discover__progress">
                  <div className="operation-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          ) : model.installed ? (
            <>
              {openUseCase && (
                <button className="btn btn-primary btn-sm" onClick={() => onOpen(openUseCase.route(name))}>
                  <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
                  {t('lifecycle.actions.open', { useCase: t(`lifecycle.open.${openUseCase.labelKey}`) })}
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => onManage(name)}>
                <i className="fas fa-sliders" aria-hidden="true" /> {t('lifecycle.actions.manageInstallation')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onInstall(name)} data-testid="discover-install">
              <i className="fas fa-download" /> {t('actions.install')}
            </button>
          )
      }
      stats={cpuMode
        ? [
          // In a CPU frame the same footprint is told as RAM, and the GPU is
          // stated as unused rather than silently dropped from the story.
          { label: t('detail.size'), value: sizeDisplay && sizeDisplay !== '0 B' ? sizeDisplay : '—' },
          { label: t('detail.ramAt', { context: contextLabel }), value: vramBytes ? `${formatBytes(vramBytes)} (est.)` : '—' },
          { label: t('detail.gpu'), value: t('detail.gpuNotUsed') },
        ]
        : [
          { label: t('detail.size'), value: sizeDisplay && sizeDisplay !== '0 B' ? sizeDisplay : '—' },
          { label: t('detail.vramAt', { context: contextLabel }), value: vramBytes ? formatBytes(vramBytes) : '—' },
          {
            // Headroom is headroom somewhere. On a distributed controller that
            // somewhere is a worker, and an unqualified figure reads as this
            // machine's, which is the confusion the cluster reading exists to
            // end.
            label: budgetNode ? t('detail.headroomOn', { node: budgetNode }) : t('detail.headroom'),
            value: headroom === null ? '—' : (headroom < 0 ? '−' : '') + formatBytes(Math.abs(headroom)),
            tone: headroom === null ? undefined : headroom < 0 ? 'bad' : 'ok',
          },
        ]}
    >

      {/* Per-model execution frame. Pinned in local storage so it survives a
          reload, a NeuroDesk restart, a new chat and switching models and
          back; each model keeps its own choice, so CPU-only here never
          disables the GPU elsewhere. The backend decides how the model really
          executes; this control remembers the frame and reports resources in
          it. runs_on_cpu is the backend's own declaration. */}
      <div className="resource-gpu-card" data-testid="discover-exec-mode">
        <div className="resource-gpu-header">
          <span className="resource-gpu-name">
            {cpuMode ? t('detail.runOnCpu') : t('detail.runDefault')}
          </span>
          <Toggle
            disabled={!runsOnCpu}
            checked={cpuMode}
            onChange={(v) => onToggleCpuMode(v)}
          />
        </div>
        {cpuMode ? (
          <>
            <p style={{ margin: '0 0 var(--spacing-xs)' }}>{t('detail.cpuUsesRam')}</p>
            {/* Never semi-silent: if CPU execution fails, the failure is the
                message, not a quiet hand-off to the GPU. */}
            <p style={{ margin: 0 }}>{t('detail.cpuFailureReported')}</p>
          </>
        ) : !runsOnCpu ? (
          <p style={{ margin: 0 }}>{t('detail.cpuUnsupported')}</p>
        ) : null}
      </div>

      {/* The VRAM curve is a comparison against this host's GPU, so it has
          nothing to say once the frame is CPU. */}
      {!cpuMode && (
        <VramByContext
          estimate={estimate}
          contextSize={contextSize}
          onPickContext={onPickContext}
          totalGpuMemory={totalGpuMemory}
          t={t}
        />
      )}

      {/* sizeDisplay and vramDisplay are withheld: the stat grid above already
          states both, and ModelDetail drops a row whose value is empty. */}
      <ModelDetail
        model={model}
        fit={fit}
        expandedFiles={expandedFiles}
        setExpandedFiles={setExpandedFiles}
        variantData={variantData}
        variantDetails={variantDetails}
        onLoadVariantDetail={onLoadVariantDetail}
        installing={installing}
        onInstall={onInstall}
        nested
        t={t}
      />
    </ModelLifecycleDetailShell>
  )
}
