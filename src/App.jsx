import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Box, AppBar, Toolbar, Typography, Divider, Button, Paper, FormControl, InputLabel, Select, MenuItem, Stack, Slider, Alert, CircularProgress, Menu, Dialog, DialogTitle, DialogContent, DialogActions, ThemeProvider, createTheme } from '@mui/material';
import Plot from 'react-plotly.js';
import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';
import axios from 'axios';


// 専門家向けのDMDUデータ分析UI
// - 3カラム構成: 左10% 入力、中央45% 散布図、右45% 時系列

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

// Material-UIテーマを作成
const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

export default function ExpertApp() {
  const [scenario, setScenario] = useState('ALL');
  const [period, setPeriod] = useState(2050);
  
  // データベースオプション選択状態
  const [dbOptions, setDbOptions] = useState({
    planting_trees_amount_level: 0,
    dam_levee_construction_cost_level: 0,
    house_migration_amount_level: 0,
    flow_irrigation_level_level: 0,
  });


  // 軸ラベル選択状態
  const [axisLabels, setAxisLabels] = useState({
    scatterX: 'Crop Yield',
    scatterY: 'Flood Damage',
    timeseriesMetric: 'Flood Damage'
  });

  // 右下コンテンツ切り替え状態
  const [contentType, setContentType] = useState('system-dynamics');
  const [popupImage, setPopupImage] = useState(null);

  // 軸範囲計算のキャッシュ
  const axisBoundsCache = useRef({});
  const timeseriesAxisBoundsCache = useRef({});

  // DMDUデータ連携状態
  const [dmduStatus, setDmduStatus] = useState('not-loaded'); // 'not-loaded', 'loading', 'loaded', 'error'
  const [dmduError, setDmduError] = useState('');
  const [meansData, setMeansData] = useState([]); // options_yearly_means.json
  const [timeseriesRaw, setTimeseriesRaw] = useState([]); // options_simulation_timeseries.json
  // AppBar menu & upload dialog
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const menuOpen = Boolean(menuAnchorEl);
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleMenuOpen = (e) => setMenuAnchorEl(e.currentTarget);
  const handleMenuClose = () => setMenuAnchorEl(null);
  const handleOpenUpload = () => { setUploadOpen(true); handleMenuClose(); };
  const handleCloseUpload = () => setUploadOpen(false);

  // 右下コンテンツデータ
  const contentData = {
    'system-dynamics': {
      title: 'システムダイナミクス',
      type: 'image',
      src: '/system_dynamics.png',
      alt: 'システムダイナミクス図'
    },
    'municipality-overview': {
      title: 'モデル自治体概要',
      type: 'image',
      src: '/municipality_overview.png',
      alt: 'モデル概要図'
    },
    'policy-options': {
      title: '意思決定項目',
      type: 'image',
      src: '/policy_options.png',
      alt: '意思決定項目図'
    },
    'goals': {
      title: '各自治体の目標',
      type: 'image',
      src: '/goals.png',
      alt: '目標図'
    },
    'stakeholders': {
      title: '担当課',
      type: 'image',
      src: '/stakeholders.png',
      alt: '担当課図'
    },
    'methodology': {
      title: '手法説明',
      type: 'pdf',
      src: '/methodology.pdf',
      alt: '手法説明書'
    },
    'results-summary': {
      title: '結果サマリー',
      type: 'image',
      src: '/results_summary.png',
      alt: '結果サマリー図'
    }
  };

  // 画像クリックハンドラー
  const handleImageClick = (src) => {
    setPopupImage(src);
  };

  // ポップアップ閉じるハンドラー
  const handleClosePopup = () => {
    setPopupImage(null);
  };

  const handleUploadFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      let loadedMeans = false;
      let loadedTs = false;
      for (const file of files) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!Array.isArray(json) || json.length === 0) continue;
        const first = json[0];
        // Detect timeseries vs means by fields
        if ((first && (first.series || first.simulation || first.params)) && !loadedTs) {
        setTimeseriesRaw(json);
          loadedTs = true;
        } else if ((first && first.metrics) && !loadedMeans) {
          setMeansData(json);
          loadedMeans = true;
        }
      }
      if (loadedMeans && loadedTs) {
        setDmduStatus('loaded');
      } else {
        setDmduError('');
      }
      setUploadOpen(false);
    } catch (err) {
      console.warn('Failed to read uploaded files', err);
    } finally {
      e.target.value = '';
    }
  };

  // APIでデータをロード
  useEffect(() => {
    loadDMDUData();
  }, []);

  const loadDMDUData = async () => {
    setDmduStatus('loading');
    try {
      const response = await axios.post(`${BACKEND_URL}/load-dmdu-data`);
      setDmduStatus('loaded');
      console.log(response.data)
      // ローカルJSONの読み込み（public配下）
      try {
        const meansResp = await fetch('/options_yearly_means.json');
        const meansJson = await meansResp.json();
        setMeansData(meansJson);
      } catch (e) {
        console.warn('Failed to load options_yearly_means.json', e);
      }
      try {
        const tsResp = await fetch('/options_simulation_timeseries.json');
        const tsJson = await tsResp.json();
        setTimeseriesRaw(tsJson);
      } catch (e) {
        console.warn('Failed to load options_simulation_timeseries.json', e);
      }
    } catch (error) {
      setDmduStatus('error');
      setDmduError(error.response?.data?.detail || 'No Data Loaded');
    }
  };

  // （遅延なし）

  // (削除) クエリ実行機能は使用しない

  // データベースオプション変更ハンドラー
  const handleDbOptionChange = (option, value) => {
    setDbOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };

  // (削除) クエリ実行機能は使用しない

  const availableMetrics = useMemo(() => [
    'Flood Damage',
    'Crop Yield',
    'Ecosystem Level',
    'Municipal Cost'
  ], []);

  // 各項目の全データから最小値・最大値を計算（軸範囲固定用・キャッシュ付き）
  const axisBounds = useMemo(() => {
    if (!meansData?.length) return {};
    
    // データのハッシュを生成してキャッシュキーとする
    const dataHash = JSON.stringify(meansData.map(r => r.metrics));
    
    // キャッシュに存在する場合はそれを返す
    if (axisBoundsCache.current[dataHash]) {
      return axisBoundsCache.current[dataHash];
    }
    
    const bounds = {};
    const metrics = ['Flood Damage', 'Crop Yield', 'Ecosystem Level', 'Municipal Cost'];
    
    // 各メトリクスの初期値を設定
    metrics.forEach(metric => {
      bounds[metric] = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY
      };
    });
    
    // 全データを走査して最小値・最大値を更新
    meansData.forEach(record => {
      const metrics_data = record.metrics || {};
      metrics.forEach(metric => {
        const value = metrics_data[metric];
        if (typeof value === 'number' && !isNaN(value)) {
          if (value < bounds[metric].min) {
            bounds[metric].min = value;
          }
          if (value > bounds[metric].max) {
            bounds[metric].max = value;
          }
        }
      });
    });
    
    // 無限大の場合は0に設定し、余白を追加
    metrics.forEach(metric => {
      if (!isFinite(bounds[metric].min)) {
        bounds[metric].min = 0;
      } else {
        // 最小値に5%の余白を追加
        const range = bounds[metric].max - bounds[metric].min;
        bounds[metric].min -= range * 0.05;
      }
      
      if (!isFinite(bounds[metric].max)) {
        bounds[metric].max = 1;
      } else {
        // 最大値に5%の余白を追加
        const range = bounds[metric].max - bounds[metric].min;
        bounds[metric].max += range * 0.05;
      }
    });
    
    // 結果をキャッシュに保存
    axisBoundsCache.current[dataHash] = bounds;
    
    return bounds;
  }, [meansData]);

  // 時系列データ用の軸範囲を別途計算（キャッシュ付き）
  const timeseriesAxisBounds = useMemo(() => {
    if (!timeseriesRaw?.length) return {};
    
    // データのハッシュを生成してキャッシュキーとする
    const dataHash = JSON.stringify(timeseriesRaw.map(r => r.series));
    
    // キャッシュに存在する場合はそれを返す
    if (timeseriesAxisBoundsCache.current[dataHash]) {
      return timeseriesAxisBoundsCache.current[dataHash];
    }
    
    const bounds = {};
    const metrics = ['Flood Damage', 'Crop Yield', 'Ecosystem Level', 'Municipal Cost'];
    
    // 各メトリクスの初期値を設定
    metrics.forEach(metric => {
      bounds[metric] = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY
      };
    });
    
    // 時系列データを走査して最小値・最大値を更新
    timeseriesRaw.forEach(record => {
      const series = record.series || {};
      metrics.forEach(metric => {
        const values = series[metric];
        if (Array.isArray(values)) {
          values.forEach(value => {
            if (typeof value === 'number' && !isNaN(value)) {
              if (value < bounds[metric].min) {
                bounds[metric].min = value;
              }
              if (value > bounds[metric].max) {
                bounds[metric].max = value;
              }
            }
          });
        }
      });
    });
    
    // 無限大の場合は0に設定（余白は追加しない）
    metrics.forEach(metric => {
      if (!isFinite(bounds[metric].min)) {
        bounds[metric].min = 0;
      }
      
      if (!isFinite(bounds[metric].max)) {
        bounds[metric].max = 1;
      }
    });
    
    // 結果をキャッシュに保存
    timeseriesAxisBoundsCache.current[dataHash] = bounds;
    
    return bounds;
  }, [timeseriesRaw]);


  // 散布図データ（meansから生成）
  const scatterData = useMemo(() => {
    if (!meansData?.length) return [];
    // 年・シナリオでフィルタ
    const filtered = meansData.filter(r => {
      const matchYear = (r.year ?? 0) === period;
      const matchScenario = scenario === 'ALL' ? true : (r.options?.RCP === scenario);
      return matchYear && matchScenario;
    });
    // optionsキーをシリアライズしシリーズ化（選択オプションは強調）
    const seriesMap = new Map();
    for (const rec of filtered) {
      const key = JSON.stringify(rec.options);
      const metrics = rec.metrics || {};
      const xv = metrics[axisLabels.scatterX] ?? null;
      const yv = metrics[axisLabels.scatterY] ?? null;
      if (xv == null || yv == null) continue;
      const isSelected = (
        rec.options?.planting_trees_amount_level === dbOptions.planting_trees_amount_level &&
        rec.options?.dam_levee_construction_cost_level === dbOptions.dam_levee_construction_cost_level &&
        rec.options?.house_migration_amount_level === dbOptions.house_migration_amount_level &&
        rec.options?.flow_irrigation_level_level === dbOptions.flow_irrigation_level_level
      );
      if (!seriesMap.has(key)) seriesMap.set(key, { x: [], y: [], customdata: [], name: key, selected: false });
      const s = seriesMap.get(key);
      s.x.push(xv);
      s.y.push(yv);
      s.customdata.push(key);
      if (isSelected) s.selected = true;
    }
    const ACCENT = '#e53935';
    const MUTED = '#b0b0b0';
    return Array.from(seriesMap.values()).map(s => ({
      ...s,
      type: 'scatter',
      mode: 'markers',
      marker: { size: s.selected ? 12 : 6, opacity: s.selected ? 1.0 : 0.35, color: s.selected ? ACCENT : MUTED },
      hovertemplate: (() => {
        const opts = JSON.parse(s.customdata[0] || '{}');
        const lines = [];
        if (opts.planting_trees_amount_level !== undefined) lines.push(`Planting & Forest Conservation Level: ${opts.planting_trees_amount_level}`);
        if (opts.dam_levee_construction_cost_level !== undefined) lines.push(`Dam & Levee Level: ${opts.dam_levee_construction_cost_level}`);
        if (opts.house_migration_amount_level !== undefined) lines.push(`House Migration Level: ${opts.house_migration_amount_level}`);
        if (opts.flow_irrigation_level_level !== undefined) lines.push(`Flow Irrigation Level: ${opts.flow_irrigation_level_level}`);
        if (opts.RCP) lines.push(`RCP: ${opts.RCP}`);
        return lines.join('<br>') + '<extra></extra>';
      })()
    }));
  }, [meansData, period, scenario, axisLabels, dbOptions.planting_trees_amount_level, dbOptions.dam_levee_construction_cost_level, dbOptions.house_migration_amount_level, dbOptions.flow_irrigation_level_level]);

  // 散布図クリックでDBオプションへ反映
  const handleScatterClick = (event) => {
    const pt = event?.points?.[0];
    if (!pt || pt.customdata == null) return;
    try {
      const opts = typeof pt.customdata === 'string' ? JSON.parse(pt.customdata) : pt.customdata;
      const next = {
        planting_trees_amount_level: Number(opts?.planting_trees_amount_level),
        dam_levee_construction_cost_level: Number(opts?.dam_levee_construction_cost_level),
        house_migration_amount_level: Number(opts?.house_migration_amount_level),
        flow_irrigation_level_level: Number(opts?.flow_irrigation_level_level)
      };
      // いずれかが数値であれば反映
      if (Object.values(next).some(v => Number.isFinite(v))) {
        setDbOptions(prev => ({
          planting_trees_amount_level: Number.isFinite(next.planting_trees_amount_level) ? next.planting_trees_amount_level : prev.planting_trees_amount_level,
          dam_levee_construction_cost_level: Number.isFinite(next.dam_levee_construction_cost_level) ? next.dam_levee_construction_cost_level : prev.dam_levee_construction_cost_level,
          house_migration_amount_level: Number.isFinite(next.house_migration_amount_level) ? next.house_migration_amount_level : prev.house_migration_amount_level,
          flow_irrigation_level_level: Number.isFinite(next.flow_irrigation_level_level) ? next.flow_irrigation_level_level : prev.flow_irrigation_level_level
        }));
      }
    } catch (_) {
      // 解析失敗時は何もしない
    }
  };

  // パラレルカテゴリクリックでDBオプションへ反映
  const handleParallelClick = (event) => {
    const pt = event?.points?.[0];
    if (!pt || pt.pointNumber == null) return;
    
    const optionsData = parallelData.optionsData;
    if (!optionsData || !optionsData[pt.pointNumber]) return;
    
    const opts = optionsData[pt.pointNumber];
    const next = {
      planting_trees_amount_level: Number(opts?.planting_trees_amount_level),
      dam_levee_construction_cost_level: Number(opts?.dam_levee_construction_cost_level),
      house_migration_amount_level: Number(opts?.house_migration_amount_level),
      flow_irrigation_level_level: Number(opts?.flow_irrigation_level_level)
    };
    
    // いずれかが数値であれば反映
    if (Object.values(next).some(v => Number.isFinite(v))) {
      setDbOptions(prev => ({
        planting_trees_amount_level: Number.isFinite(next.planting_trees_amount_level) ? next.planting_trees_amount_level : prev.planting_trees_amount_level,
        dam_levee_construction_cost_level: Number.isFinite(next.dam_levee_construction_cost_level) ? next.dam_levee_construction_cost_level : prev.dam_levee_construction_cost_level,
        house_migration_amount_level: Number.isFinite(next.house_migration_amount_level) ? next.house_migration_amount_level : prev.house_migration_amount_level,
        flow_irrigation_level_level: Number.isFinite(next.flow_irrigation_level_level) ? next.flow_irrigation_level_level : prev.flow_irrigation_level_level
      }));
    }
  };

  // パラレルカテゴリ（meansから生成・年度で平均済の値をそのまま使用）
  const parallelData = useMemo(() => {
    if (!meansData?.length) return { dimensions: [], customdata: [], optionsData: [] };
    const fixedOutputMetrics = ['Flood Damage', 'Crop Yield', 'Ecosystem Level', 'Municipal Cost'];
    const metricDisplay = {
      'Flood Damage': 'Flood Damage',
      'Crop Yield': 'Crop Yield',
      'Ecosystem Level': 'Ecosystem Level',
      'Municipal Cost': 'Municipal Cost'
    };
    const filtered = meansData.filter(r => {
      const matchYear = (r.year ?? 0) === period;
      const matchScenario = scenario === 'ALL' ? true : (r.options?.RCP === scenario);
      return matchYear && matchScenario;
    });
    // 該当年の値のみ + 選択オプション強調
    const valuesByMetric = Object.fromEntries(fixedOutputMetrics.map(m => [m, []]));
    const highlight = [];
    const customdata = [];
    const optionsData = []; // クリック用のオプションデータを保存
    
    for (const rec of filtered) {
      const isSelected = (
        rec.options?.planting_trees_amount_level === dbOptions.planting_trees_amount_level &&
        rec.options?.dam_levee_construction_cost_level === dbOptions.dam_levee_construction_cost_level &&
        rec.options?.house_migration_amount_level === dbOptions.house_migration_amount_level &&
        rec.options?.flow_irrigation_level_level === dbOptions.flow_irrigation_level_level
      ) ? 1 : 0;
      highlight.push(isSelected);
      for (const m of fixedOutputMetrics) valuesByMetric[m].push(rec.metrics?.[m] ?? 0);
      
      // ホバー情報用のカスタムデータ
      const opts = rec.options || {};
      const lines = [];
      if (opts.planting_trees_amount_level !== undefined) lines.push(`Planting Level: ${opts.planting_trees_amount_level}`);
      if (opts.dam_levee_construction_cost_level !== undefined) lines.push(`Dam & Levee Level: ${opts.dam_levee_construction_cost_level}`);
      if (opts.house_migration_amount_level !== undefined) lines.push(`House Migration Level: ${opts.house_migration_amount_level}`);
      if (opts.flow_irrigation_level_level !== undefined) lines.push(`Flow Irrigation Level: ${opts.flow_irrigation_level_level}`);
      if (opts.RCP) lines.push(`RCP: ${opts.RCP}`);
      customdata.push(lines.join('<br>'));
      
      // クリック用のオプションデータを保存
      optionsData.push(opts);
    }
    return {
      dimensions: fixedOutputMetrics.map(cat => ({
        label: metricDisplay[cat] || cat,
        values: valuesByMetric[cat] || [],
        labelfont: { size: 12, color: '#424242' },
        tickfont: { size: 10, color: '#616161' }
      })),
      line: {
        color: highlight,
        colorscale: [[0, '#b0b0b0'], [1, '#e53935']],
        showscale: false,
        width: 2
      },
      customdata: customdata,
      optionsData: optionsData,
      // パラレルカテゴリ用のホバー情報
      text: customdata,
      hoverinfo: 'text'
    };
  }, [meansData, period, scenario, dbOptions.planting_trees_amount_level, dbOptions.dam_levee_construction_cost_level, dbOptions.house_migration_amount_level, dbOptions.flow_irrigation_level_level]);

  // 時系列データ（options_simulation_timeseries.json を使用）
  const timeseriesTraces = useMemo(() => {
    if (!timeseriesRaw?.length) return [];
    // フィルタ: RCP と DBオプション完全一致
    const filtered = timeseriesRaw.filter(r => {
      const opt = r.options || {};
      const matchScenario = scenario === 'ALL' ? true : (opt.RCP === scenario);
      const matchOpts = (opt.planting_trees_amount_level === dbOptions.planting_trees_amount_level)
        && (opt.dam_levee_construction_cost_level === dbOptions.dam_levee_construction_cost_level)
        && (opt.house_migration_amount_level === dbOptions.house_migration_amount_level)
        && (opt.flow_irrigation_level_level === dbOptions.flow_irrigation_level_level);
      return matchScenario && matchOpts;
    });

    // 年配列が無い場合は series の長さから 2025 起点で再構築
    const metricKey = axisLabels.timeseriesMetric;
    const traces = [];
    for (const rec of filtered) {
      const series = rec.series || {};
      const y = Array.isArray(series[metricKey]) ? series[metricKey] : [];
      if (!y.length) continue;
      const years = Array.isArray(rec.years) && rec.years.length === y.length
        ? rec.years
        : Array.from({ length: y.length }, (_, i) => 2025 + i);
      traces.push({
        x: years,
        y,
        type: 'scatter',
        mode: 'lines',
        line: { width: 1, color: '#9e9e9e' },
        opacity: 0.15,
        hoverinfo: 'skip',
        showlegend: false,
        name: `sim-${rec.simulation}`
      });
    }
    return traces;
  }, [timeseriesRaw, scenario, dbOptions, axisLabels]);






  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar 
        position="fixed" 
        sx={{
          width: '100vw',
          height: 64,
          left: 0,
          right: 0,
          opacity: ({ scrollY }) => scrollY > 0 ? 0 : 1,
          transition: 'opacity 0.3s',
          '&:hover': {
            opacity: 1
          }
        }}
      >
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ mr: 2 }}
            onClick={handleMenuOpen}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Analyze Dashboard
          </Typography>
          <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <MenuItem onClick={handleOpenUpload}>Upload</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', width: '100%', pt: 8, height: '100%-64px' }}>
        <Dialog open={uploadOpen} onClose={handleCloseUpload} fullWidth maxWidth="sm">
          <DialogTitle>Upload JSON</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Please upload options_yearly_means.json or options_simulation_timeseries.json files.
            </Typography>
            <Button variant="outlined" component="label">
              Choose Files
              <input type="file" accept="application/json" hidden multiple onChange={handleUploadFile} />
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseUpload}>Close</Button>
          </DialogActions>
        </Dialog>
        <Box sx={{ width: '10%', minWidth: 160, borderRight: '1px solid rgba(0,0,0,0.12)', p: 2, height: 'calc(100vh - 64px)', overflow: 'auto' }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Input</Typography>
            <Divider sx={{ mb: 2 }} />
            
            <Box sx={{ mb: 2 }}>
              {dmduStatus === 'not-loaded' && (
                <Alert severity="info">Loading DMDU data...</Alert>
              )}
              {dmduStatus === 'loading' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="caption">Loading data...</Typography>
                </Box>
              )}
              {dmduStatus === 'loaded' && (
                <Alert severity="success">
                  Data loaded successfully
                </Alert>
              )}
              {dmduStatus === 'error' && (
                <Alert severity="error">{dmduError}</Alert>
              )}
            </Box>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="scenario-label">Scenario</InputLabel>
              <Select labelId="scenario-label" value={scenario} label="Scenario" onChange={(e) => setScenario(e.target.value)} size="small" aria-label="small">
                <MenuItem value={'ALL'}>ALL</MenuItem>
                <MenuItem value={'RCP1.9'}>RCP1.9</MenuItem>
                <MenuItem value={'RCP4.5'}>RCP4.5</MenuItem>
                <MenuItem value={'RCP8.5'}>RCP8.5</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>Year</Typography>
              <Slider
                value={period}
                onChange={(e, newValue) => setPeriod(newValue)}
                valueLabelDisplay="auto"
                min={2025}
                max={2100}
                step={1}
                size="small"
                aria-label="small"
                marks={[
                  { value: 2025, label: '2025' },
                  { value: 2100, label: '2100' }
                ]}
              />
            </Box>

            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Database Options</Typography>
            
            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>Planting & Forest Conservation Level</Typography>
              <Slider
                value={dbOptions.planting_trees_amount_level}
                onChange={(e, newValue) => handleDbOptionChange('planting_trees_amount_level', newValue)}
                valueLabelDisplay="auto"
                min={0}
                max={2}
                step={1}
                size="small"
                aria-label="small"
                marks={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' }
                ]}
              />
            </Box>

            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>Dam & Levee Construction Level</Typography>
              <Slider
                value={dbOptions.dam_levee_construction_cost_level}
                onChange={(e, newValue) => handleDbOptionChange('dam_levee_construction_cost_level', newValue)}
                valueLabelDisplay="auto"
                min={0}
                max={2}
                step={1}
                size="small"
                aria-label="small"
                marks={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' }
                ]}
              />
            </Box>

            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>House Migration Level</Typography>
              <Slider
                value={dbOptions.house_migration_amount_level}
                onChange={(e, newValue) => handleDbOptionChange('house_migration_amount_level', newValue)}
                valueLabelDisplay="auto"
                min={0}
                max={2}
                step={1}
                size="small"
                aria-label="small"
                marks={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' }
                ]}
              />
            </Box>

            <Box sx={{ px: 2 }}>
              <Typography gutterBottom>Flow Irrigation Level</Typography>
              <Slider
                value={dbOptions.flow_irrigation_level_level}
                onChange={(e, newValue) => handleDbOptionChange('flow_irrigation_level_level', newValue)}
                valueLabelDisplay="auto"
                min={0}
                max={2}
                step={1}
                size="small"
                aria-label="small"
                marks={[
                  { value: 0, label: '0' },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' }
                ]}
              />
            </Box>

            {/* 軸設定は各図のPaper内に移動 */}
          </Stack>
        </Box>

        <Box sx={{ width: '45%', p: 2, borderRight: '1px solid rgba(0,0,0,0.12)', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <Stack spacing={1} sx={{ height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary">Scatter Plot</Typography>
            <Paper sx={{ p: 1, pt: 3, pb: 10, flex: 1, height: 'calc(50vh - 80px)', position: 'relative' }}>
                <Plot
                  data={scatterData}
                  layout={{
                    title: { text: '', x: 0 },
                    font: { size: 10 },
                    margin: { t: 20, l: 60, r: 10, b: 64 },
                    plot_bgcolor: 'transparent',
                    paper_bgcolor: 'transparent',
                    xaxis: { 
                      showgrid: true, 
                      gridcolor: 'rgba(0,0,0,0.1)',
                      title: axisLabels.scatterX,
                      range: axisBounds[axisLabels.scatterX] ? [
                        axisBounds[axisLabels.scatterX].min,
                        axisBounds[axisLabels.scatterX].max
                      ] : undefined,
                      fixedrange: true
                    },
                    yaxis: { 
                      showgrid: true, 
                      gridcolor: 'rgba(0,0,0,0.1)',
                      title: axisLabels.scatterY,
                      range: axisBounds[axisLabels.scatterY] ? [
                        axisBounds[axisLabels.scatterY].min,
                        axisBounds[axisLabels.scatterY].max
                      ] : undefined,
                      fixedrange: true
                    },
                    showlegend: false,
                    autosize: true,
                    hovermode: 'closest',
                    hoverdistance: 50
                  }}
                  config={{ 
                    responsive: true, 
                    displayModeBar: false,
                    modeBarButtonsToRemove: [],
                    toImageButtonOptions: {
                      format: 'png',
                      filename: 'scatter_plot',
                      height: 500,
                      width: 700,
                      scale: 1
                    }
                  }}
                  style={{ width: '100%', height: '100%' }}
                  onClick={handleScatterClick}
                />
                <Box sx={{ position: 'absolute', left: 8, right: 8, bottom: 8, display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'background.paper', px: 1, py: 0.5, borderRadius: 1, boxShadow: 1 }}>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="scatter-x-label">X-axis</InputLabel>
                    <Select labelId="scatter-x-label" value={axisLabels.scatterX} label="X-axis" onChange={(e) => setAxisLabels(prev => ({ ...prev, scatterX: e.target.value }))}>
                      {availableMetrics.map((m) => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="scatter-y-label">Y-axis</InputLabel>
                    <Select labelId="scatter-y-label" value={axisLabels.scatterY} label="Y-axis" onChange={(e) => setAxisLabels(prev => ({ ...prev, scatterY: e.target.value }))}>
                      {availableMetrics.map((m) => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                    </Select>
                  </FormControl>
                </Box>
              </Paper>

            <Typography variant="subtitle2" color="text.secondary">Parallel Categories</Typography>
            <Paper sx={{ p: 1, pb: 6, flex: 1, height: 'calc(50vh - 80px)', position: 'relative' }}>
                <Plot
                  data={[{
                    type: 'parcoords',
                    line: parallelData.line,
                    ...parallelData
                  }]}
                  layout={{
                    title: { text: '', x: 0 },
                    font: { size: 10 },
                    margin: { t: 36, l: 40, r: 10, b: 20 },
                    plot_bgcolor: 'transparent',
                    paper_bgcolor: 'transparent',
                    autosize: true,
                    hovermode: 'closest',
                    hoverdistance: 50,
                    dragmode: false
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                  onClick={handleParallelClick}
                />
              </Paper>
          </Stack>
        </Box>

        <Box sx={{ width: '45%', p: 2, height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <Stack spacing={1} sx={{ height: '100%' }}>
            {/* 折れ線グラフエリア */}
            <Typography variant="subtitle2" color="text.secondary">Time Series Analysis</Typography>
            <Paper sx={{ p: 1, pb: 10, flex: 1, height: '40vh', position: 'relative' }}>
              <Plot
                data={timeseriesTraces}
                layout={{
                  title: { text: '', x: 0 },
                  font: { size: 12 },
                  margin: { t: 20, l: 60, r: 10, b: 52 },
                  plot_bgcolor: 'transparent',
                  paper_bgcolor: 'transparent',
                  xaxis: { 
                    showgrid: true, 
                    gridcolor: 'rgba(0,0,0,0.1)',
                    title: ''
                  },
                  yaxis: { 
                    showgrid: true, 
                    gridcolor: 'rgba(0,0,0,0.1)',
                    title: axisLabels.timeseriesMetric,
                    range: timeseriesAxisBounds[axisLabels.timeseriesMetric] ? [
                      timeseriesAxisBounds[axisLabels.timeseriesMetric].min,
                      timeseriesAxisBounds[axisLabels.timeseriesMetric].max
                    ] : undefined,
                    fixedrange: true
                  },
                  showlegend: false
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%', height: '100%' }}
              />
              <Box sx={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'background.paper', px: 1, py: 0.5, borderRadius: 1, boxShadow: 1 }}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="timeseries-label">Y-axis</InputLabel>
                  <Select labelId="timeseries-label" value={axisLabels.timeseriesMetric} label="Y-axis" onChange={(e) => setAxisLabels(prev => ({ ...prev, timeseriesMetric: e.target.value }))}>
                    {availableMetrics.map((m) => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                  </Select>
                </FormControl>
              </Box>
            </Paper>

            {/* 動的コンテンツ表示エリア */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Information
              </Typography>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  displayEmpty
                >
                  {Object.entries(contentData).map(([key, data]) => (
                    <MenuItem key={key} value={key}>
                      {data.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Paper sx={{ p: 2, flex: 1, height: 'calc(60vh - 80px)', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {contentData[contentType]?.type === 'image' ? (
                <Box
                  component="img"
                  src={contentData[contentType].src}
                  alt={contentData[contentType].alt}
                  onClick={() => handleImageClick(contentData[contentType].src)}
                  sx={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'scale(1.02)',
                      boxShadow: 2
                    }
                  }}
                />
              ) : contentData[contentType]?.type === 'pdf' ? (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom>
                    PDF Document
                  </Typography>
                  <Button
                    variant="contained"
                    component="a"
                    href={contentData[contentType].src}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ mt: 2 }}
                  >
                    Open {contentData[contentType].title}
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Content not found
                </Typography>
              )}
            </Paper>
          </Stack>
        </Box>
      </Box>

      {/* 画像ポップアップモーダル */}
      <Dialog
        open={!!popupImage}
        onClose={handleClosePopup}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            boxShadow: 'none'
          }
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton
            onClick={handleClosePopup}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: 'white',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.7)'
              },
              zIndex: 1
            }}
          >
            ✕
          </IconButton>
          <Box
            component="img"
            src={popupImage}
            alt="Enlarged Image"
            sx={{
              width: '100%',
              height: 'auto',
              maxHeight: '90vh',
              objectFit: 'contain'
            }}
          />
        </DialogContent>
      </Dialog>
    </Box>
    </ThemeProvider>
  );
}


