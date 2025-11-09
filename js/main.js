// Импорт PDF.js из локальных файлов
import * as pdfjsLib from '../assets/pdf.min.mjs';

// Инициализация PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../assets/pdf.worker.min.mjs', import.meta.url).toString();

document.addEventListener('DOMContentLoaded', function() {
    const viewer = document.querySelector('.pdf-viewer');
    const pagesContainer = document.querySelector('.pdf-pages-container');
    const loading = document.querySelector('.loading');
    let pdfDoc = null;
    let currentPage = 1;
    let scale = window.innerWidth <= 768 ? 2.0 : 1.0;  // Увеличенный масштаб для мобильных

    // Функция открытия PDF
    function openPDF(url) {
        viewer.classList.add('active');
        loading.classList.add('active');

        // Загружаем PDF
        const loadingTask = pdfjsLib.getDocument(url);
        loadingTask.promise.then(pdf => {
            pdfDoc = pdf;
            document.querySelector('.total-pages').textContent = pdf.numPages;
            // ИСПРАВЛЕНО: Рендерим все страницы сразу для возможности скроллинга
            renderAllPages();
        }).catch(error => {
            console.error('Ошибка при загрузке PDF:', error);
            loading.textContent = 'Ошибка загрузки PDF';
            loading.classList.remove('active');
        });
    }

    // Ленивая отрисовка: кэш canvas и рендер текущей страницы + соседних
    const canvasCache = {};
    const renderedPages = new Set();

    async function renderPage(pageNum) {
        if (!pdfDoc) return null;

        const cached = canvasCache[pageNum];
        if (cached && parseFloat(cached.dataset.scale) === scale) {
            return cached;
        }

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'pdf-page';
        canvas.setAttribute('data-page', pageNum);
        canvas.dataset.scale = scale;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        canvasCache[pageNum] = canvas;
        renderedPages.add(pageNum);
        return canvas;
    }

    // ИСПРАВЛЕНО: Рендер всех страниц PDF для возможности скроллинга
    async function renderAllPages() {
        if (!pdfDoc) return;
        try {
            pagesContainer.innerHTML = '';
            
            // Рендерим все страницы последовательно
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const canvas = await renderPage(pageNum);
                if (canvas) {
                    pagesContainer.appendChild(canvas);
                }
            }
            
            updateUI();
            // Прокручиваем к текущей странице после рендеринга всех
            const currentPageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
            if (currentPageElement) {
                currentPageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            console.error('Ошибка при рендеринге страниц:', err);
        } finally {
            loading.classList.remove('active');
        }
    }

    // Рендер только текущей страницы (используется при изменении масштаба)
    async function renderCurrentPage() {
        if (!pdfDoc) return;
        loading.classList.add('active');
        try {
            // При изменении масштаба перерендериваем все страницы
            await renderAllPages();
        } catch (err) {
            console.error('Ошибка при рендеринге страниц:', err);
        } finally {
            loading.classList.remove('active');
        }
    }

    // Обновление UI
    function updateUI() {
        document.querySelector('.current-page').textContent = currentPage;
        document.querySelector('[data-nav="prev"]').disabled = currentPage <= 1;
        document.querySelector('[data-nav="next"]').disabled = currentPage >= pdfDoc.numPages;
        document.querySelector('.zoom-level').textContent = `${Math.round(scale * 100)}%`;

        // ИСПРАВЛЕНО: Прокручиваем к текущей странице только если она существует
        const currentPageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
        if (currentPageElement) {
            currentPageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    // ИСПРАВЛЕНО: Обновление текущей страницы на основе позиции скролла
    function updateCurrentPageFromScroll() {
        if (!pdfDoc) return;
        const container = document.querySelector('.pdf-content');
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        
        // Находим страницу, которая находится в центре видимой области
        let bestPage = 1;
        let bestDistance = Infinity;
        
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const pageElement = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
            if (pageElement) {
                const pageTop = pageElement.offsetTop - pagesContainer.offsetTop;
                const pageHeight = pageElement.offsetHeight;
                const pageCenter = pageTop + pageHeight / 2;
                const viewportCenter = scrollTop + containerHeight / 2;
                const distance = Math.abs(pageCenter - viewportCenter);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestPage = pageNum;
                }
            }
        }
        
        if (bestPage !== currentPage) {
            currentPage = bestPage;
            updateUI();
        }
    }

    // ИСПРАВЛЕНО: Обработчик скролла для обновления текущей страницы
    const pdfContent = document.querySelector('.pdf-content');
    let scrollTimeout;
    pdfContent.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            updateCurrentPageFromScroll();
        }, 100); // Debounce для производительности
    });

    // Обработчики событий для навигации
    document.querySelector('[data-nav="prev"]').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            updateUI();
        }
    });

    document.querySelector('[data-nav="next"]').addEventListener('click', () => {
        if (pdfDoc && currentPage < pdfDoc.numPages) {
            currentPage++;
            const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            updateUI();
        }
    });

    // Обработчики для зума
    document.querySelector('[data-zoom="in"]').addEventListener('click', () => {
        // Очистим кэш при изменении масштаба, чтобы не сохранять canvases с разных scale
        for (const k in canvasCache) delete canvasCache[k];
        renderedPages.clear();
        scale = Math.min(scale + 0.25, 3.0);
        renderCurrentPage();
    });

    document.querySelector('[data-zoom="out"]').addEventListener('click', () => {
        for (const k in canvasCache) delete canvasCache[k];
        renderedPages.clear();
        scale = Math.max(scale - 0.25, 0.5);
        renderCurrentPage();
    });

    document.querySelector('[data-zoom="reset"]').addEventListener('click', () => {
        for (const k in canvasCache) delete canvasCache[k];
        renderedPages.clear();
        scale = window.innerWidth <= 768 ? 2.0 : 1.0;
        renderCurrentPage();
    });

    // Закрытие просмотрщика
    document.querySelector('.pdf-close').addEventListener('click', () => {
        viewer.classList.remove('active');
        pdfDoc = null;
        currentPage = 1;
        scale = window.innerWidth <= 768 ? 2.0 : 1.0;
        pagesContainer.innerHTML = '';
    });

    // Открытие PDF по клику на кнопку
    document.querySelector('.open-pdf-btn').addEventListener('click', function() {
        const pdfUrl = this.getAttribute('data-pdf-url');
        openPDF(pdfUrl);
    });

    // Обработка клавиш
    document.addEventListener('keydown', (e) => {
        if (!viewer.classList.contains('active')) return;

        switch(e.key) {
            case 'Escape':
                viewer.classList.remove('active');
                break;
            case 'ArrowLeft':
                if (currentPage > 1) {
                    currentPage--;
                    const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
                    if (pageElement) {
                        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    updateUI();
                }
                break;
            case 'ArrowRight':
                if (pdfDoc && currentPage < pdfDoc.numPages) {
                    currentPage++;
                    const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
                    if (pageElement) {
                        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    updateUI();
                }
                break;
        }
    });

    // Обработка жестов для мобильных устройств
    let touchStartX = 0;
    let touchStartY = 0;

    pagesContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });

    pagesContainer.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Определяем, был ли это горизонтальный свайп
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            if (deltaX > 0 && currentPage > 1) {
                currentPage--;
                const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
                if (pageElement) {
                    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                updateUI();
            } else if (deltaX < 0 && pdfDoc && currentPage < pdfDoc.numPages) {
                currentPage++;
                const pageElement = pagesContainer.querySelector(`[data-page="${currentPage}"]`);
                if (pageElement) {
                    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                updateUI();
            }
        }
    });
});

