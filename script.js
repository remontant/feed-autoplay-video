document.addEventListener('DOMContentLoaded', () => {
    const videoCards = document.querySelectorAll('.video-card');

    // 스크롤이 멈춘 후 스틸 이미지를 보여주는 대기 시간
    const DELAY_BEFORE_PLAY = 200;
    // 미리보기 시간
    const PREVIEW_DURATION = 5000;

    // [초강력 메모리 방어] Intersection Observer를 이용한 즉각적인 자원 해제
    // 스크롤이 멈출 때까지 기다리지 않고, 화면 위아래 500px 밖으로 벗어나는 즉시 비디오를 메모리에서 날려버립니다.
    const memoryObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                const card = entry.target;
                const video = card.querySelector('video');
                const previewBadge = card.querySelector('.preview-badge');
                const playBtn = card.querySelector('.play-btn');
                const thumbnail = card.querySelector('.thumbnail');

                // 예약된 타이머 취소 (재생 직전에 화면 밖으로 벗어난 경우 방어)
                if (card.delayTimeout) {
                    clearTimeout(card.delayTimeout);
                    card.delayTimeout = null;
                }
                if (card.previewTimeout) {
                    clearTimeout(card.previewTimeout);
                    card.previewTimeout = null;
                }

                // 미리보기 플래그 리셋 (다시 화면에 들어오면 재생되도록)
                delete card.dataset.previewDone;

                // 스트리밍 강제 종료 및 메모리 해제
                if (video && video.hasAttribute('src')) {
                    video.pause();
                    video.removeAttribute('src'); // src 속성 제거
                    video.load();                 // 캐시 연결 강제 종료
                }

                // UI 및 상태 초기화
                card.isPlaying = false;
                if (previewBadge) previewBadge.style.opacity = '0';
                if (playBtn) playBtn.style.display = 'none';
                if (thumbnail) thumbnail.classList.remove('hidden');
                if (video) video.controls = false; // 전체 재생 후 나갔다 들어왔을 때 컨트롤러 숨김
            } else {
                // 화면 안(여유 범위 내)으로 들어온 경우
                // 완전히 화면에 노출되지 않았더라도 dataset.previewDone 가 남아있을 수 있으니 스크롤 방향에 따라 처리
                const rect = entry.target.getBoundingClientRect();
                // 살짝 빗겨간 상태 (화면 안에는 아직 안 들어온 경우)
                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    delete entry.target.dataset.previewDone;
                }
            }
        });
    }, {
        rootMargin: '500px 0px', // 뷰포트 위아래 500px 밖으로 벗어나면 trigger
        threshold: 0
    });

    videoCards.forEach(card => {
        memoryObserver.observe(card);
    });

    let scrollTimeout;

    // 카드의 위치를 확인하여 화면에 보이는 카드들을 순서대로 정렬한 후,
    // 아직 재생되지 않은 첫 번째 카드를 찾는 함수
    function getTargetCardToPlay() {
        // 기존의 100px(화면 최상단 부근) 대신, 화면 높이의 40% 지점(중앙보다 살짝 위)에 
        // 카드가 도달했을 때 일찍 재생되도록 기준점을 아래로 내렸습니다.
        const TARGET_TOP = window.innerHeight * 0.4; 
        
        // 기준점이 내려간 만큼, 재생을 시작하는 여유 범위(거리)도 조금 더 넓혀줍니다.
        const MAX_ALLOWABLE_DISTANCE = 400; 
        
        let visibleCards = [];

        videoCards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // 카드가 속한 가장 가까운 그룹 컨테이너 (그리드가 있으면 그리드, 없으면 자기 자신)
            const container = card.closest('.grid-2col') || card;
            const containerRect = container.getBoundingClientRect();
            
            // 화면 안에 보일 때만 체크 (완전히 화면을 벗어나면 제외)
            if (rect.bottom > TARGET_TOP && rect.top < window.innerHeight) {
                // 스크롤이 한 번도 일어나지 않은 초기 상태(최상단)에서는 재생 금지
                if (window.scrollY === 0) return;

                // 그리드 컨테이너의 top 거리와 카드 자체의 top 거리 중 더 가까운 값을 거리로 사용
                // (그리드가 지정된 위치에 오면 그 안의 카드들이 순차 재생되도록 하기 위함)
                const distToContainer = Math.abs(containerRect.top - TARGET_TOP);
                const distToCard = Math.abs(rect.top - TARGET_TOP);
                const distance = Math.min(distToContainer, distToCard);
                
                // 허용 거리 내에 있는 카드들 수집
                if (distance < MAX_ALLOWABLE_DISTANCE) {
                    visibleCards.push({ card, rect });
                }
            }
        });

        if (visibleCards.length === 0) return null;

        // 1. 위에서 아래로 (top 기준, 오차범위 20px)
        // 2. 왼쪽에서 오른쪽으로 (left 기준)
        visibleCards.sort((a, b) => {
            if (Math.abs(a.rect.top - b.rect.top) > 20) {
                return a.rect.top - b.rect.top;
            }
            return a.rect.left - b.rect.left;
        });

        // 순서대로 확인하며 아직 미리보기가 끝나지 않은 첫 번째 카드를 타겟으로 지정
        for (let i = 0; i < visibleCards.length; i++) {
            if (!visibleCards[i].card.dataset.previewDone) {
                return visibleCards[i].card;
            }
        }

        return null;
    }

    function checkVideoCards() {
        const targetCard = getTargetCardToPlay();

        videoCards.forEach(card => {
            const video = card.querySelector('video');
            const previewBadge = card.querySelector('.preview-badge');
            const playBtn = card.querySelector('.play-btn');
            const thumbnail = card.querySelector('.thumbnail');

            if (targetCard && card === targetCard) {
                // 1. 이번에 재생할 순서인 카드인 경우
                // 아직 재생 중이 아니며, 대기 중이 아닐 때만 타이머 시작
                if (!card.delayTimeout && !card.isPlaying) {
                    card.delayTimeout = setTimeout(() => {
                        playPreview(video, previewBadge, playBtn, thumbnail, card);
                    }, DELAY_BEFORE_PLAY);
                }
            } else {
                // 2. 가장 상단에 가깝지 않은 나머지 모든 카드들
                
                // 대기 중인 타이머가 있다면 취소
                if (card.delayTimeout) {
                    clearTimeout(card.delayTimeout);
                    card.delayTimeout = null;
                }
                
                // 재생 중이거나 UI가 변경되어 있다면 즉시 스틸 이미지로 복귀 (스탑)
                if (card.isPlaying || previewBadge.style.opacity === '1') {
                    resetVideo(video, previewBadge, playBtn, thumbnail, card);
                }
                
                // 화면에서 살짝 벗어난 경우 (재생 상태만 초기화)
                const rect = card.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    delete card.dataset.previewDone;
                }
            }
        });
    }

    // 페이지 초기 로딩 시 재생하지 않고, 첫 스크롤이 발생할 때만 시작되도록 플래그 설정
    let hasScrolled = false;
    
    // 스크롤 이벤트 핸들러
    window.addEventListener('scroll', () => {
        hasScrolled = true; // 스크롤이 한 번이라도 발생했음을 기록

        // 300px 이상 스크롤 시 scrolled 클래스 추가하여 패딩 제거 및 카드 확장
        if (window.scrollY > 300) {
            document.body.classList.add('scrolled');
        } else {
            document.body.classList.remove('scrolled');
        }

        // 스크롤 중에는 새롭게 재생을 시작하기 위한 대기 타이머를 무효화합니다.
        // (즉, 스크롤이 완전히 멈춰야만 지정된 시간 대기 후 영상이 재생됩니다.)
        videoCards.forEach(card => {
            if (card.delayTimeout) {
                clearTimeout(card.delayTimeout);
                card.delayTimeout = null;
            }
        });

        // 스크롤이 멈추고 150ms가 지나면 어느 카드가 Top에 가장 가까운지 계산
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(checkVideoCards, 150);
    });

    // 페이지 로딩 시 자동 재생을 하지 않기 위해 아래 코드를 주석/제거합니다.
    // setTimeout(checkVideoCards, 500);

    function playPreview(video, previewBadge, playBtn, thumbnail, card) {
        if (card.previewTimeout) {
            clearTimeout(card.previewTimeout);
        }

        card.isPlaying = true;
        
        // 지연 로딩 (Lazy Loading): src가 아직 없다면 dataset에서 가져와 할당
        if (!video.getAttribute('src')) {
            const videoUrl = video.dataset.src;
            // [최적화] 미디어 프래그먼트: 영상의 앞 5초까지만 필요하다고 브라우저에 힌트 제공
            // 풀영상의 불필요한 후반부 데이터 버퍼링(다운로드)을 방지하여 네트워크 비용과 메모리를 절약합니다.
            const fragmentUrl = videoUrl.includes('#') ? videoUrl : `${videoUrl}#t=0,5`;
            video.setAttribute('src', fragmentUrl);
            video.load();
        }
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // 재생 시작: 스틸 이미지(썸네일) 숨기기
                if (thumbnail) thumbnail.classList.add('hidden');
                previewBadge.style.opacity = '1';
                playBtn.style.display = 'none';

                // 지정된 시간 후에 일시정지 및 스틸 이미지로 복귀
                card.previewTimeout = setTimeout(() => {
                    resetVideo(video, previewBadge, playBtn, thumbnail, card);
                    card.dataset.previewDone = 'true'; // 미리보기 완료 마킹
                    playBtn.style.display = 'block'; // 완료 후에는 재생 버튼 표시
                    card.isPlaying = false;
                    
                    // 현재 카드의 재생이 끝나면, 다음 순서의 카드를 찾아 재생하기 위해 다시 체크
                    checkVideoCards();
                }, PREVIEW_DURATION);
            }).catch(err => {
                // DOMException 방어: 사용자가 스크롤을 빨리 넘겨 pause가 먼저 호출된 경우 에러 무시
                if (err.name !== 'AbortError') {
                    console.error("비디오 자동 재생 실패:", err);
                }
                previewBadge.style.opacity = '0';
                playBtn.style.display = 'block';
                card.isPlaying = false;
            });
        }
    }

    function resetVideo(video, previewBadge, playBtn, thumbnail, card) {
        if (card.previewTimeout) {
            clearTimeout(card.previewTimeout);
            card.previewTimeout = null;
        }

        // 비디오 스탑 및 처음으로
        video.pause();
        video.currentTime = 0; 
        
        // UI 초기화 (스틸 이미지 다시 표시)
        previewBadge.style.opacity = '0';
        if (thumbnail) thumbnail.classList.remove('hidden');
        playBtn.style.display = 'none';
        
        card.isPlaying = false;
    }

    // 전체 보기 버튼 클릭 이벤트
    videoCards.forEach(card => {
        const playBtn = card.querySelector('.play-btn');
        const video = card.querySelector('video');
        const previewBadge = card.querySelector('.preview-badge');
        const thumbnail = card.querySelector('.thumbnail');

        playBtn.addEventListener('click', () => {
            if (thumbnail) thumbnail.classList.add('hidden');
            
            // 사용자가 클릭했을 때 전체 영상을 재생하기 위해
            // URL에 추가된 프래그먼트(#t=0,5)를 제거하고 원본 URL을 사용합니다.
            const originalSrc = video.dataset.src;
            if (video.getAttribute('src') !== originalSrc) {
                video.setAttribute('src', originalSrc);
                video.load();
            }
            
            video.muted = false;
            video.currentTime = 0; 
            
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    playBtn.style.display = 'none';
                    previewBadge.style.display = 'none';
                    video.controls = true; // 컨트롤러 활성화
                    
                    card.dataset.previewDone = 'true'; // 사용자가 직접 재생했으므로 미리보기 안 함
                    card.isPlaying = true; // 수동 재생 중 상태
                }).catch(err => console.error("전체 재생 실패:", err));
            }
        });
    });
});