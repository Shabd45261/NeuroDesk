package launcher

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
)

// Config represents the launcher configuration
type Config struct {
	ModelsPath   string `json:"models_path"`
	BackendsPath string `json:"backends_path"`
	Address      string `json:"address"`
	// AutoStart controls whether the launcher starts the NeuroDesk server as
	// soon as the launcher itself opens (and right after a fresh install).
	// Unset means enabled: launching the app must yield a serving endpoint,
	// which is what the quickstart docs promise. The JSON key is deliberately
	// not the legacy "auto_start": that field was never honored nor exposed
	// in any UI, so every existing launcher.json carries an unintentional
	// false that would keep auto-start permanently off (#11673).
	AutoStart       *bool             `json:"auto_start_server"`
	StartOnBoot     bool              `json:"start_on_boot"`
	LogLevel        string            `json:"log_level"`
	EnvironmentVars map[string]string `json:"environment_vars"`
	ShowWelcome     *bool             `json:"show_welcome"`
}

// Launcher represents the main launcher application
type Launcher struct {
	// Core components
	releaseManager *ReleaseManager
	config         *Config
	ui             *LauncherUI
	systray        *SystrayManager
	ctx            context.Context
	window         fyne.Window
	app            fyne.App

	// Process management
	neurodeskCmd    *exec.Cmd
	isRunning     bool
	logBuffer     *strings.Builder
	logMutex      sync.RWMutex
	statusChannel chan string

	// Logging
	logFile *os.File
	logPath string

	// UI state
	lastUpdateCheck time.Time
}

// NewLauncher creates a new launcher instance
func NewLauncher(ui *LauncherUI, window fyne.Window, app fyne.App) *Launcher {
	return &Launcher{
		releaseManager: NewReleaseManager(),
		config:         &Config{},
		logBuffer:      &strings.Builder{},
		statusChannel:  make(chan string, 100),
		ctx:            context.Background(),
		ui:             ui,
		window:         window,
		app:            app,
	}
}

// setupLogging sets up log file for NeuroDesk process output
func (l *Launcher) setupLogging() error {
	// Create logs directory in data folder
	dataPath := l.GetDataPath()
	logsDir := filepath.Join(dataPath, "logs")
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %w", err)
	}

	// Create log file with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	l.logPath = filepath.Join(logsDir, fmt.Sprintf("neurodesk_%s.log", timestamp))

	logFile, err := os.Create(l.logPath)
	if err != nil {
		return fmt.Errorf("failed to create log file: %w", err)
	}

	l.logFile = logFile
	return nil
}

// Initialize sets up the launcher
func (l *Launcher) Initialize() error {
	if l.app == nil {
		return fmt.Errorf("app is nil")
	}
	log.Printf("Initializing launcher...")

	// Setup logging
	if err := l.setupLogging(); err != nil {
		return fmt.Errorf("failed to setup logging: %w", err)
	}

	// Load configuration
	log.Printf("Loading configuration...")
	if err := l.loadConfig(); err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}
	log.Printf("Configuration loaded, current state: ModelsPath=%s, BackendsPath=%s, Address=%s, LogLevel=%s",
		l.config.ModelsPath, l.config.BackendsPath, l.config.Address, l.config.LogLevel)

	// Clean up any partial downloads
	log.Printf("Cleaning up partial downloads...")
	if err := l.releaseManager.CleanupPartialDownloads(); err != nil {
		log.Printf("Warning: failed to cleanup partial downloads: %v", err)
	}

	// Set default paths if not configured (only if not already loaded from config)
	if l.config.ModelsPath == "" {
		homeDir, _ := os.UserHomeDir()
		l.config.ModelsPath = filepath.Join(homeDir, ".neurodesk", "models")
		log.Printf("Setting default ModelsPath: %s", l.config.ModelsPath)
	}
	if l.config.BackendsPath == "" {
		homeDir, _ := os.UserHomeDir()
		l.config.BackendsPath = filepath.Join(homeDir, ".neurodesk", "backends")
		log.Printf("Setting default BackendsPath: %s", l.config.BackendsPath)
	}
	if l.config.Address == "" {
		l.config.Address = "127.0.0.1:8080"
		log.Printf("Setting default Address: %s", l.config.Address)
	}
	if l.config.LogLevel == "" {
		l.config.LogLevel = "info"
		log.Printf("Setting default LogLevel: %s", l.config.LogLevel)
	}
	if l.config.EnvironmentVars == nil {
		l.config.EnvironmentVars = make(map[string]string)
		log.Printf("Initializing empty EnvironmentVars map")
	}

	// Set default welcome window preference
	if l.config.ShowWelcome == nil {
		true := true
		l.config.ShowWelcome = &true
		log.Printf("Setting default ShowWelcome: true")
	}

	if l.config.AutoStart == nil {
		enabled := true
		l.config.AutoStart = &enabled
		log.Printf("Setting default AutoStart: true")
	}

	// Create directories
	os.MkdirAll(l.config.ModelsPath, 0755)
	os.MkdirAll(l.config.BackendsPath, 0755)

	// Save the configuration with default values
	if err := l.saveConfig(); err != nil {
		log.Printf("Warning: failed to save default configuration: %v", err)
	}

	// System tray is now handled in main.go using Fyne's built-in approach

	// Check if NeuroDesk is installed
	if !l.releaseManager.IsNeuroDeskInstalled() {
		log.Printf("No NeuroDesk installation found")
		fyne.Do(func() {
			l.updateStatus("No NeuroDesk installation found")
			if l.ui != nil {
				// Show dialog offering to download NeuroDesk
				l.showDownloadNeuroDeskDialog()
			}
		})
	} else if l.ShouldAutoStartServer() {
		// The launcher is a tray-only app: without this the user launches it,
		// sees no window and no server, and concludes it does nothing (#11673).
		log.Printf("Auto-starting NeuroDesk server")
		l.autoStartServer()
	}

	// Check for updates periodically
	go l.periodicUpdateCheck()

	return nil
}

// ShouldAutoStartServer reports whether the launcher should start the server
// without user interaction: at launcher startup and right after a fresh
// install. Defaults to enabled; StartOnBoot forces a start even when
// auto-start was explicitly disabled, preserving its historical behavior.
func (l *Launcher) ShouldAutoStartServer() bool {
	if l.config == nil {
		return false
	}
	if l.config.StartOnBoot {
		return true
	}
	return l.config.AutoStart == nil || *l.config.AutoStart
}

// autoStartServer starts NeuroDesk in the background and surfaces failures
// through the systray error dialog: during an auto-start there is no visible
// window for a regular error dialog to attach to.
func (l *Launcher) autoStartServer() {
	go func() {
		if err := l.StartNeuroDesk(); err != nil {
			log.Printf("Failed to auto-start NeuroDesk: %v", err)
			l.updateStatus(fmt.Sprintf("Failed to start NeuroDesk: %v", err))
			if l.systray != nil {
				l.systray.showStartupErrorDialog(err)
			}
		}
	}()
}

// StartNeuroDesk starts the NeuroDesk server
func (l *Launcher) StartNeuroDesk() error {
	if l.isRunning {
		return fmt.Errorf("NeuroDesk is already running")
	}

	// Verify binary integrity before starting
	if err := l.releaseManager.VerifyInstalledBinary(); err != nil {
		// Binary is corrupted, remove it and offer to reinstall
		binaryPath := l.releaseManager.GetBinaryPath()
		if removeErr := os.Remove(binaryPath); removeErr != nil {
			log.Printf("Failed to remove corrupted binary: %v", removeErr)
		}
		return fmt.Errorf("NeuroDesk binary is corrupted: %v. Please reinstall NeuroDesk", err)
	}

	binaryPath := l.releaseManager.GetBinaryPath()
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		return fmt.Errorf("NeuroDesk binary not found. Please download a release first")
	}

	// Build command arguments
	args := l.BuildRunArgs()

	l.neurodeskCmd = exec.CommandContext(l.ctx, binaryPath, args...)

	// Apply environment variables
	if len(l.config.EnvironmentVars) > 0 {
		env := os.Environ()
		for key, value := range l.config.EnvironmentVars {
			env = append(env, fmt.Sprintf("%s=%s", key, value))
		}
		l.neurodeskCmd.Env = env
	}

	// Setup logging
	stdout, err := l.neurodeskCmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := l.neurodeskCmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Start the process
	if err := l.neurodeskCmd.Start(); err != nil {
		return fmt.Errorf("failed to start NeuroDesk: %w", err)
	}

	l.isRunning = true

	fyne.Do(func() {
		l.updateStatus("NeuroDesk is starting...")
		l.updateRunningState(true)
	})

	// Start log monitoring
	go l.monitorLogs(stdout, "STDOUT")
	go l.monitorLogs(stderr, "STDERR")

	// Monitor process with startup timeout
	go func() {
		// Wait for process to start or fail
		err := l.neurodeskCmd.Wait()
		l.isRunning = false
		fyne.Do(func() {
			l.updateRunningState(false)
			if err != nil {
				l.updateStatus(fmt.Sprintf("NeuroDesk stopped with error: %v", err))
			} else {
				l.updateStatus("NeuroDesk stopped")
			}
		})
	}()

	// Add startup timeout detection
	go func() {
		time.Sleep(10 * time.Second) // Wait 10 seconds for startup
		if l.isRunning {
			// Check if process is still alive
			if l.neurodeskCmd.Process != nil {
				if err := l.neurodeskCmd.Process.Signal(syscall.Signal(0)); err != nil {
					// Process is dead, mark as not running
					l.isRunning = false
					fyne.Do(func() {
						l.updateRunningState(false)
						l.updateStatus("NeuroDesk failed to start properly")
					})
				}
			}
		}
	}()

	return nil
}

// StopNeuroDesk stops the NeuroDesk server
func (l *Launcher) StopNeuroDesk() error {
	if !l.isRunning || l.neurodeskCmd == nil {
		return fmt.Errorf("NeuroDesk is not running")
	}

	// Gracefully terminate the process
	if err := l.neurodeskCmd.Process.Signal(os.Interrupt); err != nil {
		// If graceful termination fails, force kill
		if killErr := l.neurodeskCmd.Process.Kill(); killErr != nil {
			return fmt.Errorf("failed to kill NeuroDesk process: %w", killErr)
		}
	}

	l.isRunning = false
	fyne.Do(func() {
		l.updateRunningState(false)
		l.updateStatus("NeuroDesk stopped")
	})
	return nil
}

// IsRunning returns whether NeuroDesk is currently running
func (l *Launcher) IsRunning() bool {
	return l.isRunning
}

// Shutdown performs cleanup when the application is closing
func (l *Launcher) Shutdown() error {
	log.Printf("Launcher shutting down, stopping NeuroDesk...")

	// Stop NeuroDesk if it's running
	if l.isRunning {
		if err := l.StopNeuroDesk(); err != nil {
			log.Printf("Error stopping NeuroDesk during shutdown: %v", err)
		}
	}

	// Close log file if open
	if l.logFile != nil {
		if err := l.logFile.Close(); err != nil {
			log.Printf("Error closing log file: %v", err)
		}
		l.logFile = nil
	}

	log.Printf("Launcher shutdown complete")
	return nil
}

// GetLogs returns the current log buffer
func (l *Launcher) GetLogs() string {
	l.logMutex.RLock()
	defer l.logMutex.RUnlock()
	return l.logBuffer.String()
}

// GetRecentLogs returns the most recent logs (last 50 lines) for better error display
func (l *Launcher) GetRecentLogs() string {
	l.logMutex.RLock()
	defer l.logMutex.RUnlock()

	content := l.logBuffer.String()
	lines := strings.Split(content, "\n")

	// Get last 50 lines
	if len(lines) > 50 {
		lines = lines[len(lines)-50:]
	}

	return strings.Join(lines, "\n")
}

// GetConfig returns the current configuration
func (l *Launcher) GetConfig() *Config {
	return l.config
}

// SetConfig updates the configuration
func (l *Launcher) SetConfig(config *Config) error {
	l.config = config
	return l.saveConfig()
}

func (l *Launcher) GetUI() *LauncherUI {
	return l.ui
}

func (l *Launcher) SetSystray(systray *SystrayManager) {
	l.systray = systray
}

// GetReleaseManager returns the release manager
func (l *Launcher) GetReleaseManager() *ReleaseManager {
	return l.releaseManager
}

// GetWebUIURL returns the URL for the WebUI
func (l *Launcher) GetWebUIURL() string {
	address := l.config.Address
	if strings.HasPrefix(address, ":") {
		address = "localhost" + address
	}
	if !strings.HasPrefix(address, "http") {
		address = "http://" + address
	}
	return address
}

// BuildRunArgs assembles the argument list passed to `neurodesk run`.
//
// Storage paths are anchored to the launcher's data directory instead of the
// server's own defaults. The server resolves data/config to ${basepath}
// (the launcher process CWD, often the user's home root) and generated-content
// /uploads to shared /tmp paths. On a shared /tmp (macOS routes /tmp to
// /private/tmp for every user) the first account to run NeuroDesk creates
// /tmp/generated with 0750 perms, so any other account then fails startup with
// "mkdir /tmp/generated/content: permission denied". Keeping every writable
// path under the per-user data directory avoids both the misplacement (#10610)
// and the cross-user /tmp collision.
func (l *Launcher) BuildRunArgs() []string {
	dataPath := l.GetDataPath()
	return []string{
		"run",
		"--models-path", l.config.ModelsPath,
		"--backends-path", l.config.BackendsPath,
		"--address", l.config.Address,
		"--log-level", l.config.LogLevel,
		"--data-path", filepath.Join(dataPath, "data"),
		"--neurodesk-config-dir", filepath.Join(dataPath, "configuration"),
		"--generated-content-path", filepath.Join(dataPath, "generated"),
		"--upload-path", filepath.Join(dataPath, "uploads"),
	}
}

// GetDataPath returns the path where NeuroDesk data and logs are stored
func (l *Launcher) GetDataPath() string {
	// NeuroDesk typically stores data in the current working directory or a models directory
	// First check if models path is configured
	if l.config != nil && l.config.ModelsPath != "" {
		// Return the parent directory of models path
		return filepath.Dir(l.config.ModelsPath)
	}

	// Fallback to home directory NeuroDesk folder
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "."
	}
	return filepath.Join(homeDir, ".neurodesk")
}

// CheckForUpdates checks if there are any available updates
func (l *Launcher) CheckForUpdates() (bool, string, error) {
	log.Printf("CheckForUpdates: checking for available updates...")
	available, version, err := l.releaseManager.IsUpdateAvailable()
	if err != nil {
		log.Printf("CheckForUpdates: error occurred: %v", err)
		return false, "", err
	}
	log.Printf("CheckForUpdates: result - available=%v, version=%s", available, version)
	l.lastUpdateCheck = time.Now()
	return available, version, nil
}

// DownloadUpdate downloads the latest version
func (l *Launcher) DownloadUpdate(version string, progressCallback func(downloaded, total int64)) error {
	return l.releaseManager.DownloadRelease(version, progressCallback)
}

// GetCurrentVersion returns the current installed version
func (l *Launcher) GetCurrentVersion() string {
	return l.releaseManager.GetInstalledVersion()
}

// GetCurrentStatus returns the current status
func (l *Launcher) GetCurrentStatus() string {
	select {
	case status := <-l.statusChannel:
		return status
	default:
		if l.isRunning {
			return "NeuroDesk is running"
		}
		return "Ready"
	}
}

// GetLastStatus returns the last known status without consuming from channel
func (l *Launcher) GetLastStatus() string {
	if l.isRunning {
		return "NeuroDesk is running"
	}

	// Check if NeuroDesk is installed
	if !l.releaseManager.IsNeuroDeskInstalled() {
		return "NeuroDesk not installed"
	}

	return "Ready"
}

func (l *Launcher) githubReleaseNotesURL(version string) (*url.URL, error) {
	// Construct GitHub release URL
	releaseURL := fmt.Sprintf("https://github.com/%s/%s/releases/tag/%s",
		l.releaseManager.GitHubOwner,
		l.releaseManager.GitHubRepo,
		version)

	// Convert string to *url.URL
	return url.Parse(releaseURL)
}

// showDownloadNeuroDeskDialog shows a dialog offering to download NeuroDesk
func (l *Launcher) showDownloadNeuroDeskDialog() {
	if l.app == nil {
		log.Printf("Cannot show download dialog: app is nil")
		return
	}

	fyne.DoAndWait(func() {
		// Create a standalone window for the download dialog
		dialogWindow := l.app.NewWindow("NeuroDesk Installation Required")
		dialogWindow.CenterOnScreen()
		dialogWindow.SetCloseIntercept(func() {
			dialogWindow.Close()
		})

		// Create the dialog content
		titleLabel := widget.NewLabel("NeuroDesk Not Found")
		titleLabel.TextStyle = fyne.TextStyle{Bold: true}
		titleLabel.Alignment = fyne.TextAlignCenter

		messageLabel := widget.NewLabel("NeuroDesk is not installed on your system.\n\nWould you like to download and install the latest version?")
		messageLabel.Wrapping = fyne.TextWrapWord
		messageLabel.Alignment = fyne.TextAlignCenter

		// Buttons
		downloadButton := widget.NewButton("Download & Install", func() {
			dialogWindow.Close()
			l.downloadAndInstallNeuroDesk()
			if l.systray != nil {
				l.systray.recreateMenu()
			}
		})
		downloadButton.Importance = widget.HighImportance

		// Release notes button
		releaseNotesButton := widget.NewButton("View Release Notes", func() {
			// Get latest release info and open release notes
			go func() {
				release, err := l.releaseManager.GetLatestRelease()
				if err != nil {
					log.Printf("Failed to get latest release info: %v", err)
					return
				}

				releaseNotesURL, err := l.githubReleaseNotesURL(release.Version)
				if err != nil {
					log.Printf("Failed to parse URL: %v", err)
					return
				}

				l.app.OpenURL(releaseNotesURL)
			}()
		})

		skipButton := widget.NewButton("Skip for Now", func() {
			dialogWindow.Close()
		})

		// Layout - put release notes button above the main action buttons
		actionButtons := container.NewHBox(skipButton, downloadButton)
		content := container.NewVBox(
			titleLabel,
			widget.NewSeparator(),
			messageLabel,
			widget.NewSeparator(),
			releaseNotesButton,
			widget.NewSeparator(),
			actionButtons,
		)

		dialogWindow.SetContent(content)
		resizeToContent(dialogWindow, content)
		dialogWindow.Show()
	})
}

// downloadAndInstallNeuroDesk downloads and installs the latest NeuroDesk version
func (l *Launcher) downloadAndInstallNeuroDesk() {
	if l.app == nil {
		log.Printf("Cannot download NeuroDesk: app is nil")
		return
	}

	// First check what the latest version is
	go func() {
		log.Printf("Checking for latest NeuroDesk version...")
		available, version, err := l.CheckForUpdates()
		if err != nil {
			log.Printf("Failed to check for updates: %v", err)
			l.showDownloadError("Failed to check for latest version", err.Error())
			return
		}

		if !available {
			log.Printf("No updates available, but NeuroDesk is not installed")
			l.showDownloadError("No Version Available", "Could not determine the latest NeuroDesk version. Please check your internet connection and try again.")
			return
		}

		log.Printf("Latest version available: %s", version)
		// Show progress window with the specific version
		l.showDownloadProgress(version, fmt.Sprintf("Downloading NeuroDesk %s...", version))
	}()
}

// showDownloadError shows an error dialog for download failures
func (l *Launcher) showDownloadError(title, message string) {
	fyne.DoAndWait(func() {
		// Create error window
		errorWindow := l.app.NewWindow("Download Error")
		errorWindow.Resize(fyne.NewSize(400, 200))
		errorWindow.CenterOnScreen()
		errorWindow.SetCloseIntercept(func() {
			errorWindow.Close()
		})

		// Error content
		titleLabel := widget.NewLabel(title)
		titleLabel.TextStyle = fyne.TextStyle{Bold: true}
		titleLabel.Alignment = fyne.TextAlignCenter

		messageLabel := widget.NewLabel(message)
		messageLabel.Wrapping = fyne.TextWrapWord
		messageLabel.Alignment = fyne.TextAlignCenter

		// Close button
		closeButton := widget.NewButton("Close", func() {
			errorWindow.Close()
		})

		// Layout
		content := container.NewVBox(
			titleLabel,
			widget.NewSeparator(),
			messageLabel,
			widget.NewSeparator(),
			closeButton,
		)

		errorWindow.SetContent(content)
		errorWindow.Show()
	})
}

// showDownloadProgress shows a standalone progress window for downloading NeuroDesk
// after a fresh install (no NeuroDesk binary present yet).
func (l *Launcher) showDownloadProgress(version, title string) {
	l.showDownloadProgressWindow(version, title, func(win fyne.Window) {
		message := "NeuroDesk has been downloaded and installed successfully. You can now start NeuroDesk from the launcher."
		if l.ShouldAutoStartServer() {
			message = "NeuroDesk has been downloaded and installed successfully. It will start now: manage it and open the WebUI from the system tray icon."
		}
		dialog.ShowConfirm("Installation Complete", message,
			func(bool) {
				win.Close()
				l.updateStatus("NeuroDesk installed successfully")
				if l.systray != nil {
					l.systray.recreateMenu()
				}
				// A fresh install should end with a running server, not with
				// the user hunting for a start button in the tray (#11673).
				if l.ShouldAutoStartServer() && !l.isRunning {
					l.autoStartServer()
				}
			}, win)
	})
}

// showDownloadProgressWindow renders the download progress popup shared by every
// "download/upgrade NeuroDesk" entry point. It owns the progress bar, the
// human-readable byte readout, resume-aware retry, and content-fit window
// sizing so the behaviour stays identical everywhere. onSuccess runs (on the UI
// goroutine) once the download verifies, and is responsible for the success
// dialog and any follow-up; the window is passed in so it can be parented/closed.
func (l *Launcher) showDownloadProgressWindow(version, title string, onSuccess func(win fyne.Window)) {
	fyne.DoAndWait(func() {
		progressWindow := l.app.NewWindow("Downloading NeuroDesk")
		progressWindow.CenterOnScreen()
		progressWindow.SetCloseIntercept(func() {
			progressWindow.Close()
		})

		progressBar := widget.NewProgressBar()
		progressBar.SetValue(0)

		// Status label. Truncate with an ellipsis so a long "Download failed:
		// <url>" message can't stretch the window (and progress bar) to fit the
		// whole error on one line.
		statusLabel := widget.NewLabel("Preparing download...")
		statusLabel.Truncation = fyne.TextTruncateEllipsis

		releaseNotesButton := widget.NewButton("View Release Notes", func() {
			releaseNotesURL, err := l.githubReleaseNotesURL(version)
			if err != nil {
				log.Printf("Failed to parse URL: %v", err)
				return
			}
			l.app.OpenURL(releaseNotesURL)
		})

		// Retry button: hidden until a download fails. GitHub downloads are
		// flaky, and the underlying download resumes from the partial file, so
		// a retry continues where it left off rather than starting over.
		retryButton := widget.NewButton("Retry", nil)
		retryButton.Importance = widget.HighImportance
		retryButton.Hide()

		buttonRow := container.NewHBox(releaseNotesButton, retryButton)
		content := container.NewVBox(
			widget.NewLabel(title),
			progressBar,
			statusLabel,
			widget.NewSeparator(),
			buttonRow,
		)
		progressWindow.SetContent(content)
		resizeToContent(progressWindow, content)

		var startDownload func()
		startDownload = func() {
			retryButton.Hide()
			progressBar.SetValue(0)
			statusLabel.SetText("Preparing download...")
			resizeToContent(progressWindow, content)

			go func() {
				err := l.DownloadUpdate(version, func(downloaded, total int64) {
					fyne.Do(func() {
						if total > 0 {
							progressBar.SetValue(float64(downloaded) / float64(total))
							statusLabel.SetText(fmt.Sprintf("Downloading… %s / %s", formatBytes(downloaded), formatBytes(total)))
						} else {
							statusLabel.SetText(fmt.Sprintf("Downloading… %s", formatBytes(downloaded)))
						}
					})
				})

				fyne.Do(func() {
					if err != nil {
						statusLabel.SetText(fmt.Sprintf("Download failed: %v", err))
						retryButton.Show()
						resizeToContent(progressWindow, content)
						return
					}
					progressBar.SetValue(1.0)
					statusLabel.SetText("Download complete")
					onSuccess(progressWindow)
				})
			}()
		}
		retryButton.OnTapped = startDownload

		progressWindow.Show()
		startDownload()
	})
}

// resizeToContent sizes a window to fit its content (with a sane minimum width)
// so the dialog doesn't show a large blank gap below the last widget.
func resizeToContent(w fyne.Window, content fyne.CanvasObject) {
	size := content.MinSize()
	if size.Width < 400 {
		size.Width = 400
	}
	w.Resize(size)
}

// formatBytes renders a byte count as a human-readable size (e.g. "12.3 MB").
func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// monitorLogs monitors the output of NeuroDesk and adds it to the log buffer
func (l *Launcher) monitorLogs(reader io.Reader, prefix string) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		timestamp := time.Now().Format("15:04:05")
		logLine := fmt.Sprintf("[%s] %s: %s\n", timestamp, prefix, line)

		l.logMutex.Lock()
		l.logBuffer.WriteString(logLine)
		// Keep log buffer size reasonable
		if l.logBuffer.Len() > 100000 { // 100KB
			content := l.logBuffer.String()
			// Keep last 50KB
			if len(content) > 50000 {
				l.logBuffer.Reset()
				l.logBuffer.WriteString(content[len(content)-50000:])
			}
		}
		l.logMutex.Unlock()

		// Write to log file if available
		if l.logFile != nil {
			if _, err := l.logFile.WriteString(logLine); err != nil {
				log.Printf("Failed to write to log file: %v", err)
			}
		}

		fyne.Do(func() {
			// Notify UI of new log content
			if l.ui != nil {
				l.ui.OnLogUpdate(logLine)
			}

			// Check for startup completion
			if strings.Contains(line, "API server listening") {
				l.updateStatus("NeuroDesk is running")
			}
		})
	}
}

// updateStatus updates the status and notifies UI
func (l *Launcher) updateStatus(status string) {
	select {
	case l.statusChannel <- status:
	default:
		// Channel full, skip
	}

	if l.ui != nil {
		l.ui.UpdateStatus(status)
	}

	if l.systray != nil {
		l.systray.UpdateStatus(status)
	}
}

// updateRunningState updates the running state in UI and systray
func (l *Launcher) updateRunningState(isRunning bool) {
	if l.ui != nil {
		l.ui.UpdateRunningState(isRunning)
	}

	if l.systray != nil {
		l.systray.UpdateRunningState(isRunning)
	}
}

// periodicUpdateCheck checks for updates periodically
func (l *Launcher) periodicUpdateCheck() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			available, version, err := l.CheckForUpdates()
			if err == nil && available {
				fyne.Do(func() {
					l.updateStatus(fmt.Sprintf("Update available: %s", version))
					if l.systray != nil {
						l.systray.NotifyUpdateAvailable(version)
					}
					if l.ui != nil {
						l.ui.NotifyUpdateAvailable(version)
					}
				})
			}
		case <-l.ctx.Done():
			return
		}
	}
}

// loadConfig loads configuration from file
func (l *Launcher) loadConfig() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	configPath := filepath.Join(homeDir, ".neurodesk", "launcher.json")
	log.Printf("Loading config from: %s", configPath)

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		log.Printf("Config file not found, creating default config")
		// Create default config
		return l.saveConfig()
	}

	// Load existing config
	configData, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("failed to read config file: %w", err)
	}

	log.Printf("Config file content: %s", string(configData))

	log.Printf("loadConfig: about to unmarshal JSON data")
	if err := json.Unmarshal(configData, l.config); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}
	log.Printf("loadConfig: JSON unmarshaled successfully")

	log.Printf("Loaded config: ModelsPath=%s, BackendsPath=%s, Address=%s, LogLevel=%s",
		l.config.ModelsPath, l.config.BackendsPath, l.config.Address, l.config.LogLevel)
	log.Printf("Environment vars: %v", l.config.EnvironmentVars)

	return nil
}

// saveConfig saves configuration to file
func (l *Launcher) saveConfig() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(homeDir, ".neurodesk")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Marshal config to JSON
	log.Printf("saveConfig: marshaling config with EnvironmentVars: %v", l.config.EnvironmentVars)
	configData, err := json.MarshalIndent(l.config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}
	log.Printf("saveConfig: JSON marshaled successfully, length: %d", len(configData))

	configPath := filepath.Join(configDir, "launcher.json")
	log.Printf("Saving config to: %s", configPath)
	log.Printf("Config content: %s", string(configData))

	if err := os.WriteFile(configPath, configData, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	log.Printf("Config saved successfully")
	return nil
}
