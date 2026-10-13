const fs = require('fs');
const path = require('path');

const TEAMS = [
  { id: 'card-1', name: '알파드라이브원', tag: '리마인X앨리즈' },
  { id: 'card-2', name: '앤더블', tag: '리마인X앤클로' },
  { id: 'card-3', name: '빅뱅', tag: '리마인과함께_븨아피' },
  { id: 'card-4', name: '하츠투하츠', tag: 'ReminexS2U' },
  { id: 'card-5', name: '베이비몬스터', tag: '리마인X몬스티즈' }
];

// 리센느 전체 MAMA 투표 (#2026MAMAVOTE #rescene)
const OVERALL_QUERY = '#2026MAMAVOTE #rescene';
const DATA_FILE = path.join(__dirname, '..', 'data', 'tweet_counts.json');
const JS_DATA_FILE = path.join(__dirname, '..', 'data', 'tweet_counts.js');

function getKSTDateString(utcIsoString) {
  const date = new Date(utcIsoString);
  const kstTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  const y = kstTime.getUTCFullYear();
  const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayKSTKey() {
  const now = new Date();
  const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const y = kstTime.getUTCFullYear();
  const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchCountsForQuery(token, query, startTimeIso) {
  const url = new URL('https://api.twitter.com/2/tweets/counts/recent');
  url.searchParams.set('query', query);
  url.searchParams.set('granularity', 'hour');
  if (startTimeIso) {
    url.searchParams.set('start_time', startTimeIso);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'ResceneMAMAVoteHelper/1.0'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`X API Error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

async function main() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    console.warn('⚠️ X_BEARER_TOKEN 환경변수가 없습니다. 로컬 테스트 모드로 종료합니다.');
    process.exit(0);
  }

  let currentData = { updated_at: '', updated_display: '', total_today: 0, overall: {}, teams: {} };
  if (fs.existsSync(DATA_FILE)) {
    try {
      currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('기존 데이터 파일 파싱 실패, 새로 초기화합니다.');
    }
  }

  if (!currentData.teams) currentData.teams = {};
  if (!currentData.overall) currentData.overall = { today: 0, total: 0, history: {} };

  const todayKey = getTodayKSTKey();
  const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000) + (60 * 1000));
  const mamaStartUtc = new Date('2026-10-11T15:00:00Z');
  const effectiveStart = mamaStartUtc > sevenDaysAgo ? mamaStartUtc : sevenDaysAgo;
  const startTimeIso = effectiveStart.toISOString();

  // 1️⃣ [0번 검색] 리센느 전체 MAMA 투표 (#2026MAMAVOTE #rescene)
  console.log(`[0/6 전체 조회] 리센느 MAMA 전체 투표 (${OVERALL_QUERY})...`);
  try {
    const overallResult = await fetchCountsForQuery(token, OVERALL_QUERY, startTimeIso);
    const overallHistory = currentData.overall?.history || {};

    if (Array.isArray(overallResult.data)) {
      const tempMap = {};
      for (const bucket of overallResult.data) {
        const kstDate = getKSTDateString(bucket.start);
        tempMap[kstDate] = (tempMap[kstDate] || 0) + (bucket.tweet_count || 0);
      }
      for (const [date, count] of Object.entries(tempMap)) {
        overallHistory[date] = count;
      }
    }

    const overallToday = overallHistory[todayKey] || 0;
    let overallTotal = 0;
    for (const count of Object.values(overallHistory)) {
      overallTotal += count;
    }

    currentData.overall = {
      query: OVERALL_QUERY,
      today: overallToday,
      total: overallTotal,
      history: overallHistory
    };
    console.log(`✅ 리센느 MAMA 전체: 오늘 ${overallToday}건 / 누적 ${overallTotal}건`);
    await new Promise(r => setTimeout(r, 600));
  } catch (err) {
    console.error(`❌ 리센느 전체 조회 실패:`, err.message);
  }

  // 2️⃣ [1~5번 검색] 5개 팀별 연합 해시태그 각각 조회 (#2026MAMAVOTE #rescene #팀연합태그)
  let grandTotalTeamsToday = 0;

  for (let i = 0; i < TEAMS.length; i++) {
    const team = TEAMS[i];
    const query = `#2026MAMAVOTE #rescene #${team.tag}`;
    console.log(`[${i + 1}/6 팀별 조회] ${team.name} (${query})...`);

    try {
      const result = await fetchCountsForQuery(token, query, startTimeIso);
      const history = currentData.teams[team.id]?.history || {};

      if (Array.isArray(result.data)) {
        const tempDailyMap = {};
        for (const bucket of result.data) {
          const kstDate = getKSTDateString(bucket.start);
          tempDailyMap[kstDate] = (tempDailyMap[kstDate] || 0) + (bucket.tweet_count || 0);
        }

        for (const [date, count] of Object.entries(tempDailyMap)) {
          history[date] = count;
        }
      }

      const teamToday = history[todayKey] || 0;
      grandTotalTeamsToday += teamToday;

      let teamTotal = 0;
      for (const count of Object.values(history)) {
        teamTotal += count;
      }

      currentData.teams[team.id] = {
        name: team.name,
        tag: team.tag,
        today: teamToday,
        total: teamTotal,
        history: history
      };

      console.log(`✅ ${team.name}: 오늘 ${teamToday}건 / 누적 ${teamTotal}건`);
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`❌ ${team.name} 조회 실패:`, err.message);
    }
  }

  const now = new Date();
  const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const y = kstTime.getUTCFullYear();
  const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstTime.getUTCDate()).padStart(2, '0');
  const h = String(kstTime.getUTCHours()).padStart(2, '0');
  const min = String(kstTime.getUTCMinutes()).padStart(2, '0');

  currentData.updated_at = now.toISOString();
  currentData.updated_display = `${y}.${m}.${d} ${h}:${min} KST`;
  currentData.total_today = grandTotalTeamsToday;

  fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2), 'utf8');
  fs.writeFileSync(JS_DATA_FILE, `// 자동 생성된 실시간 트위터 집계 데이터 (로컬 file:/// 및 웹 공용)\nwindow.TWEET_COUNTS_DATA = ${JSON.stringify(currentData, null, 2)};\n`, 'utf8');
  console.log(`🎉 6개 쿼리 완료! 연합 합계: ${grandTotalTeamsToday}건, 리센느 전체 MAMA: ${currentData.overall?.today || 0}건`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
