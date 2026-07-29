import React, { useState, useEffect } from 'react';
import { Settings, Camera, Calendar as CalendarIcon, DollarSign, PieChart, TrendingUp } from 'lucide-react';

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 7, 1)); // 2026년 8월
  const [activeTab, setActiveTab] = useState('calendar');

  // 초깃값 데이터 (조 구분: A조, C조, A/C조)
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem('moa_events');
    return saved ? JSON.parse(saved) : {
      '2026-08-01': { text: 'T2 현대면세 A조', type: 'A조', color: '#1e3a8a' },
      '2026-08-02': { text: 'T2 현대면세 A조', type: 'A조', color: '#1e3a8a' },
      '2026-08-03': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-05': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-06': { text: 'T1 프레쉬 A조', type: 'A조', color: '#b45309' },
      '2026-08-09': { text: 'T1 신세계 스면세 A조', type: 'A조', color: '#b45309' },
      '2026-08-10': { text: 'T2 불가리팝업 A/C조', type: 'A/C조', color: '#b45309' },
      '2026-08-11': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-13': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-14': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-15': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-16': { text: 'T1 C&P A조', type: 'A조', color: '#047857' },
      '2026-08-17': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-20': { text: 'T1 프레쉬 A조', type: 'A조', color: '#b45309' },
      '2026-08-21': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-23': { text: 'T2 불가리팝업 A/C조', type: 'A/C조', color: '#b45309' },
      '2026-08-24': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-26': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-27': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-28': { text: 'T2 불가리팝업 A조', type: 'A조', color: '#b45309' },
      '2026-08-29': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
      '2026-08-31': { text: 'T2 불가리팝업 C조', type: 'C조', color: '#1e3a8a' },
    };
  });

  useEffect(() => {
    localStorage.setItem('moa_events', JSON.stringify(events));
  }, [events]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // 근무 횟수 집계
  let countA = 0;
  let countC = 0;
  let countAC = 0;
  let workDaysCount = 0; // 총 출근 일수 (22일)

  Object.entries(events).forEach(([dateKey, val]) => {
    if (dateKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
      workDaysCount++;
      const text = val.text || '';
      if (text.includes('A/C') || val.type === 'A/C조') {
        countAC++;
      } else if (text.includes('A조') || val.type === 'A조') {
        countA++;
      } else if (text.includes('C조') || val.type === 'C조') {
        countC++;
      }
    }
  });

  // A/C조는 하루 2근으로 계산하여 총 24근(회) 집계
  const totalWorkCount = countA + countC + (countAC * 2);

  // 급여 계산 데이터
  const targetSalary = 2500000;
  const grossSalary = 3360000;
  const tax = Math.round(grossSalary * 0.033);
  const netSalary = grossSalary - tax;

  // 분석 탭 데이터
  const monthlySalaryData = [
    { month: '1월', salary: 3100000 },
    { month: '2월', salary: 3250000 },
    { month: '3월', salary: 2950000 },
    { month: '4월', salary: 3400000 },
    { month: '5월', salary: 3180000 },
    { month: '6월', salary: 3300000 },
    { month: '7월', salary: 3200000 },
    { month: '8월', salary: grossSalary },
  ];

  const totalYearlySalary = monthlySalaryData.reduce((acc, cur) => acc + cur.salary, 0);
  const avgYearlySalary = Math.round(totalYearlySalary / monthlySalaryData.length);

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#2c2c2c] flex flex-col items-center font-sans overflow-x-hidden">
      <div className="w-full max-w-md px-3 pt-4 pb-20 flex-1 flex flex-col box-border">
        
        {/* 상단 타이틀 */}
        <div className="flex justify-between items-center mb-3 px-1">
          <div>
            <span className="text-[10px] tracking-widest text-[#8c8275] font-bold block">M O A</span>
            <h1 className="text-xl font-black text-[#3a3228] tracking-tight">모으다</h1>
          </div>
          <button className="p-1.5 rounded-full bg-white/80 border border-[#e5dfd3] text-[#6b5e52]">
            <Settings size={16} />
          </button>
        </div>

        {/* 탭 1: 캘린더 */}
        {activeTab === 'calendar' && (
          <div className="flex-1 flex flex-col">
            <div className="bg-white/80 border border-[#e8e2d5] rounded-xl p-2 mb-2 flex justify-between items-center shadow-sm">
              <button onClick={prevMonth} className="px-2 py-0.5 font-bold text-[#6b5e52] text-xs">&lt;</button>
              <span className="text-sm font-extrabold text-[#3a3228]">{year}년 {month + 1}월</span>
              <button onClick={nextMonth} className="px-2 py-0.5 font-bold text-[#6b5e52] text-xs">&gt;</button>
            </div>

            <button className="w-full py-1.5 bg-white/90 border border-[#d8d0c0] rounded-lg text-[11px] font-semibold text-[#6b5e52] flex items-center justify-center gap-1 shadow-sm mb-2">
              <Camera size={13} />
              배경화면 이미지 저장
            </button>

            {/* 달력 컨테이너 (너비 고정 및 가로 스크롤 방지) */}
            <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-1.5 shadow-sm w-full box-border">
              <div className="grid grid-cols-7 text-center mb-1 w-full">
                {daysOfWeek.map((day, idx) => (
                  <span
                    key={day}
                    className={`text-[10px] font-extrabold ${
                      idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-[#8c8275]'
                    }`}
                  >
                    {day}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 w-full">
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-[62px] bg-transparent" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayOfWeek = new Date(year, month, dayNum).getDay();
                  const event = events[dateStr];

                  const isSunday = dayOfWeek === 0;
                  const isSaturday = dayOfWeek === 6;

                  return (
                    <div
                      key={dayNum}
                      className="h-[62px] p-0.5 bg-[#fdfbf7] border border-[#ebe5d8] rounded flex flex-col justify-between overflow-hidden min-w-0 box-border"
                    >
                      <div className="flex items-center gap-0.5 leading-none">
                        <span className={`text-[10px] font-extrabold ${isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-[#4a4035]'}`}>
                          {dayNum}
                        </span>
                        <span className="text-[8px] text-[#8c8275]">({daysOfWeek[dayOfWeek]})</span>
                      </div>

                      <div className="flex-1 my-0.5 flex items-center overflow-hidden min-w-0">
                        {event && (
                          <p
                            className="text-[8.5px] font-bold leading-tight break-all overflow-hidden"
                            style={{
                              color: event.color || '#1e3a8a',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {event.text}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-2 mt-2 pt-1.5 border-t border-[#f0eae0] text-[9px] text-[#7a6f62]">
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"/>휴무</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-600"/>면접</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600"/>스터디</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-600"/>알바</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-gray-400"/>기타</span>
              </div>
            </div>

            <p className="text-[9px] text-center text-[#9c9284] mt-1.5">
              날짜를 눌러 근무·지출·일정을 기록하세요.
            </p>
          </div>
        )}

        {/* 탭 2: 정산 */}
        {activeTab === 'settle' && (
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-[#3a3228]">정산</h2>
              <div className="bg-white/80 border border-[#e8e2d5] rounded-xl px-2 py-1 text-xs font-bold text-[#6b5e52]">
                2026년 {month + 1}월
              </div>
            </div>

            <p className="text-xs text-[#8c8275]">이번 달 출근 현황</p>

            {/* A조 / C조 / A/C조 카드 구조 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/90 border border-[#d8d0c0] rounded-xl p-2.5 text-center shadow-sm">
                <span className="text-xs font-bold text-[#7a6f62] block">A조</span>
                <span className="text-lg font-black text-[#b45309]">{countA}회</span>
              </div>
              <div className="bg-white/90 border border-[#d8d0c0] rounded-xl p-2.5 text-center shadow-sm">
                <span className="text-xs font-bold text-[#7a6f62] block">C조</span>
                <span className="text-lg font-black text-[#1e3a8a]">{countC}회</span>
              </div>
              <div className="bg-white/90 border border-[#d8d0c0] rounded-xl p-2.5 text-center shadow-sm">
                <span className="text-xs font-bold text-[#7a6f62] block">A/C조</span>
                <span className="text-lg font-black text-[#047857]">{countAC}회</span>
              </div>
            </div>

            {/* 총 근무일(22일) 및 총 근무 횟수(24회) */}
            <div className="text-xs font-semibold text-[#6b5e52] text-center py-0.5">
              총 근무일 <span className="font-bold text-[#3a3228]">{workDaysCount}일</span> · 총 근무 횟수 <span className="font-bold text-[#1e3a8a]">{totalWorkCount}회</span>
            </div>

            {/* 이번 달 목표 */}
            <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-3 shadow-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-[#6b5e52]">🎯 이번 달 목표</span>
                <span className="text-xs font-black text-[#1e3a8a]">2,500,000원</span>
              </div>
              <div className="w-full bg-[#f0eae0] h-2 rounded-full overflow-hidden my-1.5">
                <div className="bg-[#1e3a8a] h-full w-full rounded-full" />
              </div>
              <span className="text-[10px] text-[#047857] font-bold">100% 이번 달 목표를 달성했어요! 🎉</span>
            </div>

            {/* 급여 영역 (<8월 급여> 타이틀) */}
            <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-3.5 shadow-sm space-y-2">
              <h3 className="text-sm font-extrabold text-[#3a3228] border-b border-[#f0eae0] pb-1.5">
                &lt;{month + 1}월 급여&gt;
              </h3>
              <div className="flex justify-between text-xs text-[#6b5e52]">
                <span>세전 총수당</span>
                <span className="font-bold text-[#047857]">{grossSalary.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-xs text-[#6b5e52]">
                <span>원천징수 3.3% 공제</span>
                <span className="font-bold text-red-500">-{tax.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm font-black text-[#3a3228] pt-1.5 border-t border-[#f0eae0]">
                <span>세후 실수령액</span>
                <span className="text-[#1e3a8a]">{netSalary.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        )}

        {/* 탭 3: 분석 */}
        {activeTab === 'analytics' && (
          <div className="flex-1 flex flex-col gap-3">
            <h2 className="text-lg font-bold text-[#3a3228]">분석</h2>

            {/* 연평균 및 총수령액 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-3 shadow-sm">
                <span className="text-[11px] font-semibold text-[#7a6f62] block">연평균 월급여</span>
                <span className="text-base font-black text-[#1e3a8a]">{avgYearlySalary.toLocaleString()}원</span>
              </div>
              <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-3 shadow-sm">
                <span className="text-[11px] font-semibold text-[#7a6f62] block">올해 총 수령액</span>
                <span className="text-base font-black text-[#047857]">{totalYearlySalary.toLocaleString()}원</span>
              </div>
            </div>

            {/* 월별 급여 차트 */}
            <div className="bg-white/90 border border-[#e5dfd3] rounded-xl p-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-[#3a3228] flex items-center gap-1">
                  <TrendingUp size={14} className="text-[#1e3a8a]" /> 월별 급여 추이
                </h3>
                <span className="text-[10px] text-[#8c8275]">2026년</span>
              </div>

              <div className="space-y-2">
                {monthlySalaryData.map((item, idx) => {
                  const percent = Math.round((item.salary / 4000000) * 100);
                  const isCurrent = idx === monthlySalaryData.length - 1;

                  return (
                    <div key={item.month} className="space-y-0.5">
                      <div className="flex justify-between text-[10px] font-semibold">
                        <span className={isCurrent ? 'font-bold text-[#1e3a8a]' : 'text-[#6b5e52]'}>{item.month}</span>
                        <span className={isCurrent ? 'font-bold text-[#1e3a8a]' : 'text-[#3a3228]'}>{item.salary.toLocaleString()}원</span>
                      </div>
                      <div className="w-full bg-[#f0eae0] h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isCurrent ? 'bg-[#1e3a8a]' : 'bg-[#a39889]'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 하단 탭 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-[#e5dfd3] px-6 py-1.5 flex justify-around items-center max-w-md mx-auto z-50">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center ${activeTab === 'calendar' ? 'text-[#3a3228] font-bold' : 'text-[#a39889]'}`}
        >
          <CalendarIcon size={16} />
          <span className="text-[9px]">캘린더</span>
        </button>

        <button
          onClick={() => setActiveTab('settle')}
          className={`flex flex-col items-center ${activeTab === 'settle' ? 'text-[#3a3228] font-bold' : 'text-[#a39889]'}`}
        >
          <DollarSign size={16} />
          <span className="text-[9px]">정산</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center ${activeTab === 'analytics' ? 'text-[#3a3228] font-bold' : 'text-[#a39889]'}`}
        >
          <PieChart size={16} />
          <span className="text-[9px]">분석</span>
        </button>
      </div>
    </div>
  );
}
