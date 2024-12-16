import { App, Plugin, Notice, TFile, Modal, Setting, PluginSettingTab } from 'obsidian';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as ngrok from 'ngrok';
import { error } from 'console';
declare module 'obsidian' {
    interface App {
        plugins: {
            enabledPlugins: Set<string>;
            plugins: {
                [key: string]: any;
            };
        };
    }
}
interface WebsidianSettings {
    ngrokUrl: string;
    exportPath: string;
}

const DEFAULT_SETTINGS: WebsidianSettings = {
    ngrokUrl: '',
    exportPath: ''
};

export default class WebsidianPlugin extends Plugin {
    settings: WebsidianSettings;
    serverProcess: any = null;
    ngrokProcess: any = null;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new WebsidianSettingTab(this.app, this));

        // close everything when the app is closed
        this.app.workspace.on('quit', async () => {
            await this.onunload();
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Get HTML Export plugin instance
    getHtmlExportPlugin() {
        const htmlExport = this.app.plugins.plugins["webpage-html-export"];
        if (!htmlExport) {
            new Notice("HTML Export plugin is not installed or enabled");
            return null;
        }
        return htmlExport;
    }

     // Export file using HTML Export plugin
     async exportFile(file: TFile): Promise<boolean> {
        const htmlExport = this.getHtmlExportPlugin();
        if (!htmlExport) return false;
        
        try {
            new Notice('Starting export...');
            
            // 獲取完整的文件路徑
            const fullPath = (this.app.vault.adapter as any).getFullPath(file.path);
            const exportPath = path.dirname(fullPath);
            this.settings.exportPath = exportPath;
            await this.saveSettings();
            
            console.log(exportPath);

            try {
                // 配置 HTML Export 設置
                htmlExport.settings.exportPreset = "raw-documents";
    
                // 執行導出
                await htmlExport.html_expoter.export(
                    true,
                    [file],
                    new htmlExport.Path(exportPath)
                );
                
                new Notice('Export completed');
                return true;
    
            } catch (error) {
                console.error("Path error:", error);
                new Notice("Invalid export path");
                return false;
            }
        } catch (error) {
            console.error("Export error:", error);
            new Notice(`Failed to export file: ${error.message}`);
            return false;
        }
    }


    // Modified startServer to use exported HTML
    async startServer() {
        if (this.serverProcess) {
            new Notice('Server is already running.');
            return;
        }

        const files = this.app.vault.getFiles();
        const modal = new FileSelectionModal(this.app, files, async (file: TFile) => {
            if (file) {
                const success = await this.exportFile(file);
                if (success) {
                    // 等待一下確保文件已完全寫入
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    console.log("file.path", file.path);
                    await this.runGoServer(file.path);
                }
            }
        });
        modal.open();
    }

    // Run go server with the exported HTML
    async runGoServer(filePath: string) {
        const pluginPath = (this.app.vault.adapter as any).getFullPath(
            '.obsidian/plugins/Websidian'
        );
        const mainGoPath = path.join(pluginPath, 'Web', 'main.go');
        
        // 使用和導出時相同的路徑

        const fullPath = (this.app.vault.adapter as any).getFullPath(filePath);
        const exportPath = path.dirname(fullPath);
        
        // 獲取導出後的HTML文件名
        const htmlFilename = path.basename(filePath, '.md') + '.html';
        const exportedFilePath = path.join(exportPath, htmlFilename);

        // 檢查導出的文件是否存在
        if (!fs.existsSync(exportedFilePath)) {
            new Notice(`Exported file not found: ${exportedFilePath}`);
            console.log("file not found", exportedFilePath);
            return;
        }

        let content = fs.readFileSync(mainGoPath, 'utf8');
        content = content.replace(
            /var\s+file_path\s*=\s*"[^"]*"/,
            `var file_path = "${exportedFilePath.replace(/\\/g, '\\\\')}"`
        );
        
        fs.writeFileSync(mainGoPath, content);

        const webDir = path.join(pluginPath, 'Web');
        
        this.serverProcess = exec('go run main.go', { cwd: webDir }, (error) => {
            if (error) {
                new Notice(`Error executing main.go: ${error.message}`);
                return;
            }
        });
        new Notice('Server started on port 8080');
    }

    // Rest of the methods remain the same
    async stopServer() {
        await fetch(`http://localhost:8080/shutdown`);

        if (this.serverProcess) {
            this.serverProcess.kill('SIGINT');
            this.serverProcess = null;
        }

        new Notice('Server shutting down');
    }

    async startNgrok() {
        try {
            const url = await ngrok.connect({
                addr: 8080,
                binPath: (defaultPath) => {
                    return 'C:\\Program Files\\ngrok'
                },
                authtoken: '2nszHpjRqbqZdUKp8Hwpf0G6RaZ_25Jibwnp3gaRdMrHQGB3H'
            });
        
            this.settings.ngrokUrl = url;
            await this.saveSettings();
        } catch (error) {
            console.error('Error:', error);
            throw error;
        }
        new Notice('Ngrok tunnel started');
    }

    async stopNgrok() {
        await ngrok.disconnect();
        await ngrok.kill();

        if (this.ngrokProcess) {
            this.ngrokProcess.kill();
            this.ngrokProcess = null;
            this.settings.ngrokUrl = '';
            await this.saveSettings();
        }
        new Notice('Ngrok tunnel stopped');
    }

    async onunload() {
        await this.stopNgrok();
        await this.stopServer();
        await fetch(`http://localhost:8080/shutdown`);
    }
}

// Modified settings tab to include export path
class WebsidianSettingTab extends PluginSettingTab {
    plugin: WebsidianPlugin;

    constructor(app: App, plugin: WebsidianPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
    
        containerEl.createEl('h2', { text: 'Websidian Settings' });
    
        // Export path setting
        new Setting(containerEl)
            .setName('Export Path')
            .setDesc('Path where exported HTML files will be saved')
            .addText(text => text
                .setPlaceholder('Enter export path')
                .setValue(this.plugin.settings.exportPath)
                .onChange(async (value) => {
                    // Validate and normalize path
                    const normalizedPath = value.replace(/\\/g, '/');
                    if (!normalizedPath.startsWith('/')) {
                        // Make relative path absolute
                        const vaultPath = (this.app.vault.adapter as any).getBasePath();
                        this.plugin.settings.exportPath = path.join(vaultPath, normalizedPath);
                    } else {
                        this.plugin.settings.exportPath = normalizedPath;
                    }
                    await this.plugin.saveSettings();
                }));
    
        // Port info
        new Setting(containerEl)
            .setName('Server Port')
            .setDesc('8080');
    
        // Ngrok URL if available
        if (this.plugin.settings.ngrokUrl) {
            const urlContainer = containerEl.createEl('div', { cls: 'url-container' });
            new Setting(urlContainer)
                .setName('Ngrok URL')
                .addText(text => {
                    text.inputEl.value = this.plugin.settings.ngrokUrl;
                    text.inputEl.readOnly = true;
                })
                .addButton(button => {
                    button
                        .setButtonText('Copy')
                        .onClick(() => {
                            navigator.clipboard.writeText(this.plugin.settings.ngrokUrl);
                            new Notice('URL copied to clipboard!');
                        });
                });
        }
    
        // Control buttons
        new Setting(containerEl)
            .addButton(button => {
                button
                    .setButtonText('Start Ngrok')
                    .setClass('mod-cta')
                    .onClick(async () => {
                        await this.plugin.startNgrok();
                        this.display();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('Stop Ngrok')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        await this.plugin.stopNgrok();
                        this.display();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('Run server')
                    .setClass('mod-cta')
                    .onClick(async () => {
                        await this.plugin.startServer();
                        this.display();
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('Stop server')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        await this.plugin.stopServer();
                        this.display();
                    });
            });
    }
}

// File selection modal remains the same
class FileSelectionModal extends Modal {
    files: TFile[];
    onChoose: (file: TFile) => void;
    searchInput: HTMLInputElement;
    resultContainer: HTMLDivElement;
    filteredFiles: TFile[];

    constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onChoose = onChoose;
        this.filteredFiles = files;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search for files...'
        });
        this.searchInput.classList.add('search-input');

        this.resultContainer = contentEl.createEl('div');
        this.resultContainer.classList.add('file-list-container');

        this.searchInput.addEventListener('input', () => {
            this.updateFileList();
        });

        this.updateFileList();

        this.searchInput.focus();
    }

    updateFileList() {
        const searchTerm = this.searchInput.value.toLowerCase();
        this.filteredFiles = this.files.filter(file => 
            file.path.toLowerCase().includes(searchTerm)
        );

        this.resultContainer.empty();

        this.filteredFiles.forEach(file => {
            const fileItem = this.resultContainer.createEl('div', {
                text: file.path,
                cls: 'file-item'
            });

            fileItem.addEventListener('click', () => {
                this.onChoose(file);
                this.close();
            });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}