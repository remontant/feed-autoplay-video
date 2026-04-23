document.addEventListener('DOMContentLoaded', () => {
    const videoCards = document.querySelectorAll('.video-card');

    // 스크롤이 멈춘 후 스틸 이미지를 보여주는 대기 시간
    const DELAY_BEFORE_PLAY = 200;
    // 미리보기 시간 (3초)
    const PREVIEW_DURATION = 3500;

    let scrollTimeout;

    // 카드의 위치를 확인하여 화면에 보이는 카드들을 순서대로 정렬한 후,
    // 아직 재생되지 않은 첫 번째 카드를 찾는 함수
    function getTargetCardToPlay() {
        const TARGET_TOP = 100; 
        // 화면 최상단과 카드 상단 사이의 거리가 이 값(픽셀) 이내일 때만 재생 조건 성립
        const MAX_ALLOWABLE_DISTANCE = 300; 
        
        let visibleCards = [];

        videoCards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // 카드가 속한 가장 가까운 그룹 컨테이너 (그리드가 있으면 그리드, 없으면 자기 자신)
            const container = card.closest('.grid-2col') || card;
            const containerRect = container.getBoundingClientRect();
            
            // 화면 안에 보일 때만 체크 (완전히 화면을 벗어나면 제외)
            if (rect.bottom > TARGET_TOP && rect.top < window.innerHeight) {
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
                
                // 완전히 화면에서 벗어났다면 다시 스크롤해서 돌아왔을 때 재생되도록 초기화 및 메모리 해제
                const rect = card.getBoundingClientRect();
                
                // 화면 밖으로 멀리 벗어난 경우 (위아래 500px 여유)
                if (rect.bottom < -500 || rect.top > window.innerHeight + 500) {
                    delete card.dataset.previewDone;
                    
                    // 긴 영상 메모리 및 네트워크 자원 해제
                    if (video.hasAttribute('src')) {
                        video.pause();
                        video.removeAttribute('src');
                        video.load(); // 스트리밍 연결 강제 종료
                    }
                } else if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    // 화면에서 살짝 벗어난 경우 (재생 상태만 초기화)
                    delete card.dataset.previewDone;
                }
            }
        });
    }

    // 스크롤 이벤트 핸들러
    window.addEventListener('scroll', () => {
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

    // 페이지 초기 로딩 시 첫 번째 카드 체크
    setTimeout(checkVideoCards, 500);

    function playPreview(video, previewBadge, playBtn, thumbnail, card) {
        if (card.previewTimeout) {
            clearTimeout(card.previewTimeout);
        }

        card.isPlaying = true;
        
        // 지연 로딩 (Lazy Loading): src가 아직 없다면 dataset에서 가져와 할당
        if (!video.getAttribute('src')) {
            video.setAttribute('src', video.dataset.src);
            video.load();
        }
        
        video.play().then(() => {
            // 재생 시작: 스틸 이미지(썸네일) 숨기기
            if (thumbnail) thumbnail.classList.add('hidden');
            previewBadge.style.opacity = '1';
            playBtn.style.display = 'none';

            // 3초 후에 일시정지 및 스틸 이미지로 복귀
            card.previewTimeout = setTimeout(() => {
                resetVideo(video, previewBadge, playBtn, thumbnail, card);
                card.dataset.previewDone = 'true'; // 미리보기 완료 마킹
                playBtn.style.display = 'block'; // 완료 후에는 재생 버튼 표시
                card.isPlaying = false;
                
                // 현재 카드의 재생이 끝나면, 다음 순서의 카드를 찾아 재생하기 위해 다시 체크
                checkVideoCards();
            }, PREVIEW_DURATION);
        }).catch(err => {
            console.error("비디오 자동 재생 실패:", err);
            previewBadge.style.opacity = '0';
            playBtn.style.display = 'block';
            card.isPlaying = false;
        });
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
            
            // 사용자가 클릭했을 때도 지연 로딩 방어
            if (!video.getAttribute('src')) {
                video.setAttribute('src', video.dataset.src);
                video.load();
            }
            
            video.muted = false;
            video.currentTime = 0; 
            
            video.play().then(() => {
                playBtn.style.display = 'none';
                previewBadge.style.display = 'none';
                video.controls = true; // 컨트롤러 활성화
                
                card.dataset.previewDone = 'true'; // 사용자가 직접 재생했으므로 미리보기 안 함
                card.isPlaying = true; // 수동 재생 중 상태
            });
        });
    });
});