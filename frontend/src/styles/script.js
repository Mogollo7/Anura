document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const preview = document.getElementById('preview');
    const prompt = document.querySelector('.drop-zone__prompt');
    const analyzeBtn = document.getElementById('analyze-btn');
    const spinner = document.getElementById('spinner');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const btnText = analyzeBtn.querySelector('span');

    let currentFile = null;

    // Drag & Drop Handlers
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragover', 'dragenter'].forEach(type => {
        dropZone.addEventListener(type, (e) => {
            e.preventDefault();
            dropZone.classList.add('drop-zone--over');
        });
    });

    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, (e) => {
            e.preventDefault();
            dropZone.classList.remove('drop-zone--over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone--over');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }
        currentFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            prompt.style.display = 'none';
            dropZone.style.padding = '1rem';
        };
        reader.readAsDataURL(file);
        checkReadyState();
    }

    function checkReadyState() {
        if (currentFile) {
            analyzeBtn.disabled = false;
        } else {
            analyzeBtn.disabled = true;
        }
    }

    // Submit Action
    analyzeBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        // UI Loading State
        analyzeBtn.disabled = true;
        btnText.textContent = 'Analyzing...';
        spinner.style.display = 'block';
        resultsSection.style.display = 'none';
        resultsContainer.innerHTML = '';

        const formData = new FormData();
        formData.append('image', currentFile);

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const data = await response.json();
            renderResults(data.predictions);
        } catch (error) {
            alert(`Error analyzing image: ${error.message}`);
        } finally {
            // Restore UI
            checkReadyState();
            btnText.textContent = 'Analyze Image';
            spinner.style.display = 'none';
        }
    });

    function renderResults(predictions) {
        resultsContainer.innerHTML = '';
        
        predictions.forEach((pred, index) => {
            const percentage = (pred.probability * 100).toFixed(2);
            const dom = document.createElement('div');
            dom.className = 'result-item';
            dom.innerHTML = `
                <div class="result-header">
                    <span class="result-label">${pred.class}</span>
                    <span class="result-score">${percentage}%</span>
                </div>
                <div class="result-bar-container">
                    <div class="result-bar" style="width: 0%"></div>
                </div>
            `;
            resultsContainer.appendChild(dom);

            // Animate bar after a tiny delay for CSS transition to catch
            setTimeout(() => {
                const bar = dom.querySelector('.result-bar');
                bar.style.width = `${percentage}%`;
            }, 50 * index);
        });

        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
});
