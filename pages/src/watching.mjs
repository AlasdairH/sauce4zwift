import * as sauce from '../../shared/sauce/index.mjs';
import * as common from './common.mjs';

common.settingsStore.setDefault({
    lockedFields: false,
    alwaysShowButtons: false,
    solidBackground: false,
    backgroundColor: '#00ff00',
    screens: [{
        id: 'default-screen-1',
        sections: [{
            type: 'large-data-fields',
            id: 'default-large-data-fields',
            groups: [{
                id: 'default-power',
                type: 'power',
            }],
        }, {
            type: 'data-fields',
            id: 'default-data-fields',
            groups: [{
                type: 'hr',
                id: 'default-hr',
            }],
        }, {
            type: 'split-data-fields',
            id: 'default-split-data-fields',
            groups: [{
                type: 'cadence',
                id: 'default-cadence',
            }, {
                type: 'draft',
                id: 'default-draft',
            }],
        }],
    }],
});

const doc = document.documentElement;
const L = sauce.locale;
const H = L.human;
const maxLineChartLen = 60;
const colors = {
    power: '#46f',
    hr: '#e22',
    pace: '#4e3',
};

let imperial = !!common.settingsStore.get('/imperialUnits');
L.setImperial(imperial);
let eventMetric = 'distance';
let sport = 'cycling';


function cadenceUnit() {
    return sport === 'cycling' ? 'rpm' : 'spm';
}


const chartRefs = new Set();

function resizeCharts() {
    for (const r of chartRefs) {
        const c = r.deref();
        if (!c) {
            chartRefs.delete(r);
        } else {
            c.resize();
        }
    }
}
addEventListener('resize', resizeCharts);


function speedUnit() {
    return sport === 'cycling' ? imperial ? 'mph' : 'kph' : imperial ? '/mi' : '/km';
}


function shortDuration(x) {
    return H.duration(x, {short: true});
}


function humanWkg(v, athlete) {
    if (v == null || v === false) {
        return '-';
    }
    return H.number(v / (athlete && athlete.weight), {precision: 1, fixed: 1});
}


const unit = x => `<abbr class="unit">${x}</abbr>`;


function _fmtDist(v) {
    if (v == null || v === Infinity || v === -Infinity || isNaN(v)) {
        return ['-', ''];
    } else if (Math.abs(v) < 1000) {
        const suffix = unit(imperial ? 'ft' : 'm');
        return [H.number(imperial ? v / L.metersPerFoot : v), suffix];
    } else {
        return H.distance(v, {precision: 1, suffix: true}).split(/([a-z]+)/i);
    }
}


function fmtDist(v) {
    const [val, u] = _fmtDist(v);
    return `${val}${unit(u)}`;
}


function fmtDistValue(v) {
    return _fmtDist(v)[0];
}


function fmtDistUnit(v) {
    return _fmtDist(v)[1];
}


function fmtDur(v) {
    if (v == null || v === Infinity || v === -Infinity || isNaN(v)) {
        return '-';
    }
    return H.timer(v);
}


function makePeakPowerField(period, lap) {
    const duration = shortDuration(period);
    const lapLabel = {
        '-1': '(lap)',
        '-2': '(last lap)',
    }[lap];
    return {
        value: x => {
            const data = x.laps && x.stats && (lap ? x.laps.at(lap) : x.stats);
            const o = data && data.power.peaks[period];
            return H.number(o && o.avg);
        },
        label: x => {
            const label = [`peak ${duration}`, lapLabel].filter(x => x);
            if (!x || !x.laps || !x.stats) {
                return label;
            }
            const data = lap ? x.laps.at(lap) : x.stats;
            const o = data && data.power.peaks[period];
            if (!(o && o.ts)) {
                return label;
            }
            const ago = (Date.now() - o.ts) / 1000;
            const agoText = `${shortDuration(ago)} ago`;
            if (label.length === 1) {
                label.push(agoText);
            } else {
                label[1] += ' | ' + agoText;
            }
            return label;
        },
        key: () => lap ? `Peak ${duration}<tiny>${lapLabel}</tiny>` : `Peak ${duration}`,
        unit: () => 'w',
    };
}


function makeSmoothPowerField(period) {
    const duration = shortDuration(period);
    return {
        value: x => H.number(x.stats && x.stats.power.smooth[period]),
        label: () => duration,
        key: () => duration,
        unit: () => 'w',
    };
}


function makeSmoothHRField(period) {
    const duration = shortDuration(period);
    return {
        value: x => H.number(x.stats && x.stats.hr.smooth[period]),
        label: () => duration,
        key: () => duration,
        unit: () => 'bpm',
    };
}


let _themeRegistered = 0;
async function createStatHistoryChart(el, sectionId) {
    const [charts, echarts, theme] = await Promise.all([
        import('./charts.mjs'),
        import('../deps/src/echarts.mjs'),
        import('./echarts-sauce-theme.mjs'),
    ]);
    if (!_themeRegistered++) {
        echarts.registerTheme('sauce', theme.getTheme('dynamic'));
    }
    const lineChart = echarts.init(el, 'sauce', {renderer: 'svg'});
    const powerSoftDomain = [0, 700];
    const hrSoftDomain = [70, 190];
    const paceSoftDomain = [0, 100];
    const visualMapCommon = {
        show: false,
        type: 'continuous',
        hoverLink: false,
    };
    const options = {
        color: [colors.power, colors.hr, colors.pace],
        visualMap: [{
            ...visualMapCommon,
            seriesIndex: 0,
            min: powerSoftDomain[0],
            max: powerSoftDomain[1],
            inRange: {
                colorAlpha: [0.4, 1],
            },
        }, {
            ...visualMapCommon,
            seriesIndex: 1,
            min: hrSoftDomain[0],
            max: hrSoftDomain[1],
            inRange: {
                colorAlpha: [0.1, 0.7],
            },
        }, {
            ...visualMapCommon,
            seriesIndex: 2,
            min: paceSoftDomain[0],
            max: paceSoftDomain[1],
            inRange: {
                colorAlpha: [0.1, 0.8],
            },
        }],
        grid: {
            top: 20,
            left: 24,
            right: 24,
            bottom: 2,
        },
        legend: {
            show: false, // need to enable actions.
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {label: {formatter: () => ''}}
        },
        xAxis: [{
            show: false,
            data: Array.from(new Array(maxLineChartLen)).map((x, i) => i),
        }],
        yAxis: [{
            show: false,
            min: powerSoftDomain[0],
            max: x => Math.max(powerSoftDomain[1], x.max),
        }, {
            show: false,
            min: x => Math.min(hrSoftDomain[0], x.min),
            max: x => Math.max(hrSoftDomain[1], x.max),
        }, {
            show: false,
            min: x => Math.min(paceSoftDomain[0], x.min),
            max: x => Math.max(paceSoftDomain[1], x.max),
        }],
        series: [{
            id: 'power',
            name: 'Power',
            type: 'line',
            z: 4,
            showSymbol: false,
            emphasis: {disabled: true},
            tooltip: {
                valueFormatter: x => H.power(x, {suffix: true}),
            },
            areaStyle: {},
            lineStyle: {
                color: colors.power,
            }
        }, {
            id: 'hr',
            name: 'HR',
            type: 'line',
            z: 3,
            showSymbol: false,
            emphasis: {disabled: true},
            yAxisIndex: 1,
            tooltip: {
                valueFormatter: x => H.number(x) + 'bpm'
            },
            areaStyle: {},
            lineStyle: {
                color: colors.hr,
            }
        }, {
            id: 'pace',
            name: 'Speed',
            type: 'line',
            z: 2,
            showSymbol: false,
            emphasis: {disabled: true},
            yAxisIndex: 2,
            tooltip: {
                valueFormatter: x => H.pace(x, {precision: 0, suffix: true, sport}),
            },
            areaStyle: {},
            lineStyle: {
                color: colors.pace,
            }
        }]
    };
    lineChart.setOption(options);
    new charts.SauceLegend({
        el: el.nextElementSibling,
        chart: lineChart,
        hiddenStorageKey: `watching-hidden-graph-p${sectionId}`,
    });
    chartRefs.add(new WeakRef(lineChart));
    return lineChart;
}

const sectionSpecs = {
    'large-data-fields': {
        title: 'Data Fields (large)',
        baseType: 'data-fields',
        groups: 1,
    },
    'data-fields': {
        title: 'Data Fields',
        baseType: 'data-fields',
        groups: 1,
    },
    'split-data-fields': {
        title: 'Split Data Fields',
        baseType: 'data-fields',
        groups: 2,
    },
    'single-data-field': {
        title: 'Single Data Field',
        baseType: 'single-data-field',
        groups: 1,
    },
    'line-chart': {
        title: 'Line Chart',
        baseType: 'chart',
        groups: 1,
        alwaysRender: true,
    }
};

const groupSpecs = {
    power: {
        title: 'Power',
        backgroundImage: 'url(../images/fa/bolt-duotone.svg)',
        fields: [{
            value: x => H.number(x.state && x.state.power),
            key: () => 'Current',
            unit: () => 'w',
        }, {
            value: x => H.number(x.stats && x.stats.power.avg),
            label: () => 'avg',
            key: () => 'Avg',
            unit: () => 'w',
        }, {
            value: x => H.number(x.stats && x.stats.power.max),
            label: () => 'max',
            key: () => 'Max',
            unit: () => 'w',
        }, {
            value: x => humanWkg(x.state && x.state.power, x.athlete),
            key: () => 'Current',
            unit: () => 'w/kg',
        }, {
            value: x => H.number(x.stats && x.stats.power.np),
            label: () => 'np',
            key: () => 'NP',
        }, {
            value: x => H.number(x.stats && x.stats.power.tss),
            label: () => 'tss',
            key: () => 'TSS',
        },
            makeSmoothPowerField(5),
            makeSmoothPowerField(15),
            makeSmoothPowerField(60),
            makeSmoothPowerField(300),
            makeSmoothPowerField(1200),
            makePeakPowerField(5),
            makePeakPowerField(15),
            makePeakPowerField(60),
            makePeakPowerField(300),
            makePeakPowerField(1200),
        {
            value: x => H.number(x.laps && x.laps.at(-1).power.avg),
            label: () => 'lap',
            key: () => 'Lap',
            unit: () => 'w',
        }, {
            value: x => humanWkg(x.laps && x.laps.at(-1).power.avg, x.athlete),
            label: () => 'lap',
            key: () => 'Lap',
            unit: () => 'w/kg',
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).power.max),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: () => 'w',
        }, {
            value: x => humanWkg(x.laps && x.laps.at(-1).power.max, x.athlete),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: () => 'w/kg',
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).power.np),
            label: () => ['np', '(lap)'],
            key: () => 'NP<tiny>(lap)</tiny>',
        },
            makePeakPowerField(5, -1),
            makePeakPowerField(15, -1),
            makePeakPowerField(60, -1),
            makePeakPowerField(300, -1),
            makePeakPowerField(1200, -1),
        {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).power.avg || null),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: () => 'w',
        }, {
            value: x => humanWkg(x.laps && x.laps.length > 1 && x.laps.at(-2).power.avg, x.athlete),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: () => 'w/kg',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).power.max || null),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: () => 'w',
        }, {
            value: x => humanWkg(x.laps && x.laps.length > 1 && x.laps.at(-2).power.max, x.athlete),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: () => 'w/kg',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).power.np || null),
            label: () => ['np', '(last lap)'],
            key: () => 'NP<tiny>(last lap)</tiny>',
        },
            makePeakPowerField(5, -2),
            makePeakPowerField(15, -2),
            makePeakPowerField(60, -2),
            makePeakPowerField(300, -2),
            makePeakPowerField(1200, -2),
        {
            value: x => H.number(x.stats && x.stats.power.np && x.stats.power.np / x.stats.power.avg,
                {precision: 1, fixed: true}),
            label: () => 'vi',
            key: () => 'VI',
        }],
    },
    hr: {
        title: 'Heart Rate',
        backgroundImage: 'url(../images/fa/heartbeat-duotone.svg)',
        fields: [{
            value: x => H.number(x.state && x.state.heartrate || null),
            key: () => 'Current',
            unit: () => 'bpm',
        }, {
            value: x => H.number(x.stats && x.stats.hr.avg || null), // XXX check the null is required
            label: () => 'avg',
            key: () => 'Avg',
            unit: () => 'bpm',
        }, {
            value: x => H.number(x.stats && x.stats.hr.max || null),
            label: () => 'max',
            key: () => 'Max',
            unit: () => 'bpm',
        },
            makeSmoothHRField(60),
            makeSmoothHRField(300),
            makeSmoothHRField(1200),
        {
            value: x => H.number(x.laps && x.laps.at(-1).hr.avg || null),
            label: () => 'lap',
            key: () => 'Lap',
            unit: () => 'bpm',
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).hr.max || null),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: () => 'bpm',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).hr.avg || null),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: () => 'bpm',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).hr.max || null),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: () => 'bpm',
        }],
    },
    cadence: {
        title: 'Cadence',
        backgroundImage: 'url(../images/fa/solar-system-duotone.svg)',
        fields: [{
            value: x => H.number(x.state && x.state.cadence),
            key: () => 'Current',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.stats && x.stats.cadence.avg || null),
            label: () => 'avg',
            key: () => 'Avg',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.stats && x.stats.cadence.max || null),
            label: () => 'max',
            key: () => 'Max',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).cadence.avg || null),
            label: () => 'lap',
            key: () => 'Lap',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).cadence.max || null),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).cadence.avg || null),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: cadenceUnit,
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).cadence.max || null),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: cadenceUnit,
        }],
    },
    draft: {
        title: 'Draft',
        backgroundImage: 'url(../images/fa/wind-duotone.svg)',
        fields: [{
            value: x => H.number(x.state && x.state.draft),
            key: () => 'Current',
            unit: () => '%',
        }, {
            value: x => H.number(x.stats && x.stats.draft.avg),
            label: () => 'avg',
            key: () => 'Avg',
            unit: () => '%',
        }, {
            value: x => H.number(x.stats && x.stats.draft.max),
            label: () => 'max',
            key: () => 'Max',
            unit: () => '%',
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).draft.avg),
            label: () => 'lap',
            key: () => 'Lap',
            unit: () => '%',
        }, {
            value: x => H.number(x.laps && x.laps.at(-1).draft.max),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: () => '%',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).draft.avg || null),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: () => '%',
        }, {
            value: x => H.number(x.laps && x.laps.length > 1 && x.laps.at(-2).draft.max || null),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: () => '%',
        }],
    },
    event: {
        title: 'Event',
        backgroundImage: 'url(../images/fa/flag-checkered-duotone.svg)',
        fields: [{
            value: x => H.place(x.eventPosition, {html: true}),
            label: () => 'place',
            key: () => 'Place',
        }, {
            value: x => eventMetric === 'distance' ? fmtDistValue(x.remaining) : fmtDur(x.remaining),
            label: () => 'finish',
            key: () => 'Finish',
            unit: x => eventMetric === 'distance' ? fmtDistUnit(x && x.state && x.state.eventDistance) : '',
        }, {
            value: x => eventMetric === 'distance' ?
                fmtDistValue(x.state && x.state.eventDistance) : fmtDur(x.state && x.state.time),
            label: () => eventMetric === 'distance' ? 'dist' : 'timer',
            key: x => eventMetric === 'distance' ? 'Dist' : 'Timer',
            unit: x => eventMetric === 'distance' ? fmtDistUnit(x && x.state && x.state.eventDistance) : '',
        }]
    },
    pace: {
        title: 'Speed',
        backgroundImage: 'url(../images/fa/tachometer-duotone.svg)',
        fields: [{
            value: x => H.pace(x.state && x.state.speed, {sport}),
            label: speedUnit,
            key: () => 'Current',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.stats && x.stats.speed.avg, {sport}),
            label: () => 'avg',
            key: () => 'Avg',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.stats && x.stats.speed.max, {sport}),
            label: () => 'max',
            key: () => 'Max',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.laps && x.laps.at(-1).speed.avg, {sport}),
            label: () => 'lap',
            key: () => 'Lap',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.laps && x.laps.at(-1).speed.max, {sport}),
            label: () => ['max', '(lap)'],
            key: () => 'Max<tiny>(lap)</tiny>',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.laps && x.laps.length > 1 && x.laps.at(-2).speed.avg, {sport}),
            label: () => 'last lap',
            key: () => 'Last Lap',
            unit: speedUnit,
        }, {
            value: x => H.pace(x.laps && x.laps.length > 1 && x.laps.at(-2).speed.max, {sport}),
            label: () => ['max', '(last lap)'],
            key: () => 'Max<tiny>(last lap)</tiny>',
            unit: speedUnit,
        }],
    },
};


async function getTpl(name) {
    return await sauce.template.getTemplate(`templates/${name}.html.tpl`);
}


function bindLineChart(lineChart, renderer) {
    const chartData = {
        pace: [],
        hr: [],
        power: [],
    };
    let dataCount = 0;
    let lastRender = 0;
    renderer.addCallback(data => {
        const now = Date.now();
        if (now - lastRender < 900) {
            return;
        }
        lastRender = now;
        if (data && data.state) {
            chartData.power.push(data.state.power || 0);
            chartData.hr.push(data.state.heartrate || 0);
            chartData.pace.push(data.state.speed || 0);
            if (chartData.power.length > maxLineChartLen) {
                chartData.power.shift();
                chartData.hr.shift();
                chartData.pace.shift();
            }
        }
        const maxPower = sauce.data.max(chartData.power);
        const maxPIndex = chartData.power.indexOf(maxPower);
        lineChart.setOption({
            xAxis: [{
                data: [...sauce.data.range(maxLineChartLen)].map(i =>
                    (dataCount > maxLineChartLen ? dataCount - maxLineChartLen : 0) + i),
            }],
            series: [{
                data: chartData.power,
                markLine: {
                    symbol: 'none',
                    data: [{
                        name: 'Max',
                        xAxis: maxPIndex,
                        label: {
                            formatter: x => {
                                const nbsp ='\u00A0';
                                return [
                                    ''.padStart(Math.max(0, 5 - x.value), nbsp),
                                    nbsp, nbsp, // for unit offset
                                    H.power(chartData.power[x.value], {suffix: true}),
                                    ''.padEnd(Math.max(0, x.value - (maxLineChartLen - 1) + 5), nbsp)
                                ].join('');
                            },
                        },
                        emphasis: {
                            disabled: true,
                        },
                    }],
                },
            }, {
                data: chartData.hr,
            }, {
                name: sport === 'cycling' ? 'Speed' : 'Pace',
                data: chartData.pace,
            }]
        });
    });
}


export async function main() {
    common.initInteractionListeners();
    setBackground();
    const settings = common.settingsStore.get();
    doc.classList.toggle('always-show-buttons', !!settings.alwaysShowButtons);
    const content = document.querySelector('#content');
    const renderers = [];
    let curScreen;
    const layoutTpl = await getTpl('watching-screen-layout');
    let persistentData = settings.screens.some(x => x.sections.some(xx => sectionSpecs[xx.type].alwaysRender));
    for (const [sIndex, screen] of settings.screens.entries()) {
        const screenEl = (await layoutTpl({
            screen,
            sIndex,
            groupSpecs,
            sectionSpecs
        })).querySelector('.screen');
        if (sIndex) {
            screenEl.classList.add('hidden');
        } else {
            curScreen = screenEl;
        }
        content.appendChild(screenEl);
        const renderer = new common.Renderer(screenEl, {
            id: screen.id,
            fps: null,
            locked: settings.lockedFields,
            backgroundRender: screen.sections.some(x => sectionSpecs[x.type].alwaysRender),
        });
        for (const sectionEl of screenEl.querySelectorAll('[data-section-id]')) {
            const sectionType = sectionEl.dataset.sectionType;
            if (sectionSpecs[sectionType].baseType === 'data-fields') {
                const groups = [
                    sectionEl.dataset.groupId ? sectionEl : null,
                    ...sectionEl.querySelectorAll('[data-group-id]')
                ].filter(x => x);
                for (const groupEl of groups) {
                    const mapping = [];
                    for (const [i, fieldEl] of groupEl.querySelectorAll('[data-field]').entries()) {
                        const id = fieldEl.dataset.field;
                        mapping.push({id, default: Number(fieldEl.dataset.default || i)});
                    }
                    renderer.addRotatingFields({
                        el: groupEl,
                        mapping,
                        fields: groupSpecs[groupEl.dataset.groupType].fields,
                    });
                }
            } else if (sectionSpecs[sectionType].baseType === 'single-data-field') {
                const groups = [
                    sectionEl.dataset.groupId ? sectionEl : null,
                    ...sectionEl.querySelectorAll('[data-group-id]')
                ].filter(x => x);
                for (const groupEl of groups) {
                    const mapping = [];
                    for (const [i, fieldEl] of groupEl.querySelectorAll('[data-field]').entries()) {
                        const id = fieldEl.dataset.field;
                        mapping.push({id, default: Number(fieldEl.dataset.default || i)});
                    }
                    renderer.addRotatingFields({
                        el: groupEl,
                        mapping,
                        fields: groupSpecs[groupEl.dataset.groupType].fields,
                    });
                }
            } else if (sectionType === 'line-chart') {
                const lineChart = await createStatHistoryChart(
                    sectionEl.querySelector('.chart-holder.ec'),
                    sectionEl.dataset.sectionId);
                bindLineChart(lineChart, renderer);
            }
        }
        renderers.push(renderer);
        renderer.setData({});
        renderer.render();
    }
    const bbSelector = settings.alwaysShowButtons ? '.fixed.button-bar' : '#titlebar .button-bar';
    const prevBtn = document.querySelector(`${bbSelector} .button.prev-screen`);
    const nextBtn = document.querySelector(`${bbSelector} .button.next-screen`);
    prevBtn.classList.add('disabled');
    if (settings.screens.length === 1) {
        nextBtn.classList.add('disabled');
    }
    prevBtn.addEventListener('click', ev => {
        if (!curScreen.previousElementSibling) {
            return;
        }
        curScreen.classList.add('hidden');
        curScreen = curScreen.previousElementSibling;
        curScreen.classList.remove('hidden');
        nextBtn.classList.remove('disabled');
        resizeCharts();
        if (Number(curScreen.dataset.index) === 0) {
            prevBtn.classList.add('disabled');
        }
    });
    nextBtn.addEventListener('click', ev => {
        if (!curScreen.nextElementSibling) {
            return;
        }
        curScreen.classList.add('hidden');
        curScreen = curScreen.nextElementSibling;
        curScreen.classList.remove('hidden');
        prevBtn.classList.remove('disabled');
        resizeCharts();
        if (settings.screens.length === Number(curScreen.dataset.index) + 1) {
            nextBtn.classList.add('disabled');
        }
    });
    const resetBtn = document.querySelector(`${bbSelector} .button.reset`);
    resetBtn.addEventListener('click', ev => {
        common.rpc.resetStats();
    });
    const lapBtn = document.querySelector(`${bbSelector} .button.lap`);
    lapBtn.addEventListener('click', ev => {
        common.rpc.startLap();
    });
    document.addEventListener('keydown', ev => {
        if (ev.ctrlKey && ev.shiftKey) {
            if (ev.key === 'ArrowRight') {
                ev.preventDefault();
                nextBtn.click();
            } else if (ev.key === 'ArrowLeft') {
                ev.preventDefault();
                prevBtn.click();
            } else if (ev.key === 'L') {
                ev.preventDefault();
                lapBtn.click();
            } else if (ev.key === 'R') {
                ev.preventDefault();
                resetBtn.click();
            }
        }
    }, {capture: true});
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;
        if (changed.size === 1) {
            if (changed.has('backgroundColor')) {
                setBackground();
            } else if (changed.has('/imperialUnits')) {
                imperial = changed.get('/imperialUnits');
            } else {
                location.reload();
            }
        } else {
            location.reload();
        }
    });
    let athleteId;
    common.subscribe('athlete/watching', watching => {
        const force = watching.athleteId !== athleteId;
        athleteId = watching.athleteId;
        sport = {
            0: 'cycling',
            1: 'running',
        }[watching.state.sport] || 'other';
        eventMetric = watching.remainingMetric || 'distance';
        for (const x of renderers) {
            x.setData(watching);
            if (x.backgroundRender || !x._contentEl.classList.contains('hidden')) {
                x.render({force});
            }
        }
    }, {persistent: persistentData});
}


async function initScreenSettings() {
    const layoutTpl = await getTpl('watching-screen-layout');
    let sIndex = 0;
    const activeScreenEl = document.querySelector('main .active-screen');
    const sIndexEl = document.querySelector('.sIndex');
    const sLenEl = document.querySelector('.sLen');
    const prevBtn = document.querySelector('main header .button[data-action="prev"]');
    const nextBtn = document.querySelector('main header .button[data-action="next"]');
    const delBtn = document.querySelector('main header .button[data-action="delete"]');
    document.querySelector('main .add-section select[name="type"]').innerHTML = Object.entries(sectionSpecs)
        .map(([type, {title}]) => `<option value="${type}">${title}</option>`).join('\n');
    const settings = common.settingsStore.get();

    async function renderScreen() {
        sIndexEl.textContent = sIndex + 1;
        const sLen = settings.screens.length;
        sLenEl.textContent = sLen;
        const screen = settings.screens[sIndex];
        const screenEl = (await layoutTpl({
            screen,
            sIndex,
            groupSpecs,
            sectionSpecs,
            configuring: true
        })).querySelector('.screen');
        activeScreenEl.innerHTML = '';
        activeScreenEl.appendChild(screenEl);
        prevBtn.classList.toggle('disabled', sIndex === 0);
        nextBtn.classList.toggle('disabled', sIndex === sLen - 1);
        delBtn.classList.toggle('disabled', sLen === 1);
    }

    document.querySelector('main header .button-group').addEventListener('click', ev => {
        const btn = ev.target.closest('.button-group .button');
        const action = btn && btn.dataset.action;
        if (!action) {
            return;
        }
        if (action === 'add') {
            settings.screens.push({
                id: `user-section-${settings.screens.length +1}-${Date.now()}`,
                sections: []
            });
            common.settingsStore.set(null, settings);
            sIndex = settings.screens.length - 1;
            renderScreen();
        } else if (action === 'next') {
            sIndex++;
            renderScreen();
        } else if (action === 'prev') {
            sIndex--;
            renderScreen();
        } else if (action === 'delete') {
            settings.screens.splice(sIndex, 1);
            sIndex = Math.max(0, sIndex -1);
            common.settingsStore.set(null, settings);
            renderScreen();
        }
    });
    document.querySelector('main .add-section input[type="button"]').addEventListener('click', ev => {
        ev.preventDefault();
        const type = ev.currentTarget.closest('.add-section').querySelector('select[name="type"]').value;
        const screen = settings.screens[sIndex];
        screen.sections.push({
            type,
            id: `user-section-${Date.now()}`,
            groups: Array.from(new Array(sectionSpecs[type].groups)).map((_, i) => ({
                id: `user-group-${i}-${Date.now()}`,
                type: Object.keys(groupSpecs)[i] || 'power',
            })),
        });
        common.settingsStore.set(null, settings);
        renderScreen();
    });
    activeScreenEl.addEventListener('click', ev => {
        const btn = ev.target.closest('.screen-section .button-group .button');
        const action = btn && btn.dataset.action;
        if (!action) {
            return;
        }
        const sectionEl = btn.closest('.screen-section');
        const sectionId = sectionEl.dataset.sectionId;
        const screen = settings.screens[sIndex];
        if (action === 'edit') {
            const d = sectionEl.querySelector('dialog.edit');
            d.addEventListener('close', ev => {
                if (d.returnValue !== 'save') {
                    return;
                }
                const section = screen.sections.find(x => x.id === sectionId);
                for (const g of d.querySelectorAll('select[name="group"]')) {
                    section.groups.find(x => x.id === g.dataset.id).type = g.value;
                }
                common.settingsStore.set(null, settings);
                renderScreen();
            }, {once: true});
            d.showModal();
        } else if (action === 'delete') {
            screen.sections.splice(screen.sections.findIndex(x => x.id === sectionId), 1);
            common.settingsStore.set(null, settings);
            renderScreen();
        } else {
            throw new TypeError("Invalid action: " + action);
        }
    });
    await renderScreen();
}


function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}


export async function settingsMain() {
    common.initInteractionListeners();
    await common.initSettingsForm('form#general')();
    await initScreenSettings();
}
