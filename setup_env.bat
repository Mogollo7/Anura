@echo off
REM ================================================================
REM  setup_env.bat — Crea el entorno virtual y lo configura para Anura
REM  Ejecutar desde la carpeta raíz del proyecto: .\setup_env.bat
REM ================================================================

echo ============================================================
echo  Anura — Setup de Entorno Virtual
echo ============================================================

REM 1. Verificar Python
python --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo [ERROR] Python no encontrado. Instala Python 3.10+ desde python.org
    pause
    exit /b 1
)
echo [OK] Python encontrado.

REM 2. Crear entorno virtual en 'venv'
IF NOT EXIST "venv\" (
    echo Creando entorno virtual en 'venv\'...
    python -m venv venv
    echo [OK] Entorno virtual creado.
) ELSE (
    echo [OK] Entorno virtual ya existe.
)

REM 3. Activar entorno
echo Activando entorno virtual...
call venv\Scripts\activate.bat

REM 4. Actualizar pip
echo Actualizando pip...
python -m pip install --upgrade pip --quiet

REM 5. Instalar PyTorch con CUDA (auto-detectar GPU)
echo.
echo Detectando GPU...
python -c "import subprocess; r=subprocess.run(['nvidia-smi'], capture_output=True); exit(0 if r.returncode==0 else 1)" >nul 2>&1
IF ERRORLEVEL 1 (
    echo [Info] Sin GPU NVIDIA detectada. Instalando PyTorch CPU...
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --quiet
) ELSE (
    echo [Info] GPU NVIDIA detectada. Instalando PyTorch + CUDA 12.1...
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121 --quiet
)

REM 6. Instalar resto de dependencias
echo.
echo Instalando dependencias del proyecto...
pip install -r requirements.txt --quiet

REM 7. Verificar instalación
echo.
echo Verificando instalacion...
python -c "import torch, open_clip, sklearn, mlflow, albumentations, flask; print('[OK] Todos los paquetes instalados correctamente.')"

echo.
echo ============================================================
echo  Entorno listo. Para activarlo manualmente:
echo    venv\Scripts\activate
echo.
echo  Para entrenar el modelo:
echo    python scripts\train_finetune.py
echo.
echo  Para lanzar la app web:
echo    python app.py
echo.
echo  Para ver resultados MLflow:
echo    mlflow ui --backend-store-uri data/mlruns
echo ============================================================
pause
