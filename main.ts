// main.ts
import { App, Plugin, Notice, TFile, Modal, Setting, PluginSettingTab } from 'obsidian';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as ngrok from 'ngrok';

interface WebsidianSettings {
    ngrokUrl: string;
}

const DEFAULT_SETTINGS: WebsidianSettings = {
    ngrokUrl: ''
};

export default class WebsidianPlugin extends Plugin {
    settings: WebsidianSettings;
    serverProcess: any = null;
    ngrokProcess: any = null;
    // triggered when the plugin is loaded
    async onload() { 
        //this.settings.ngrokUrl = '';
        await this.loadSettings();
        this.addSettingTab(new WebsidianSettingTab(this.app, this));
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    // start server
    async startServer() {
        if (this.serverProcess) {
            new Notice('Server is already running.');
            return;
        }

        const files = this.app.vault.getFiles();
        const modal = new FileSelectionModal(this.app, files, async (file: TFile) => {
            if (file) {
                await this.runGoServer(file.path);
            }
        });
        modal.open();
    }
    // run go server
    async runGoServer(filePath: string) {
        const pluginPath = (this.app.vault.adapter as any).getFullPath(
            '.obsidian/plugins/websidian'
        );
        const mainGoPath = path.join(pluginPath, 'Web', 'main.go');
        const vaultPath = (this.app.vault.adapter as any).getBasePath();
        const absoluteFilePath = path.join(vaultPath, filePath);

        let content = fs.readFileSync(mainGoPath, 'utf8');
        content = content.replace(
            /var\s+file_path\s*=\s*"[^"]*"/,
            `var file_path = "${absoluteFilePath.replace(/\\/g, '\\\\')}"`
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
    // close port
    async stopServer() {
        await fetch(`http://localhost:8080/shutdown`);

        if (this.serverProcess) {
            this.serverProcess.kill('SIGINT');
            this.serverProcess = null;
        }

        new Notice('Server shutting down');
    }
    // start ngrok
    async startNgrok() {
        try {
            // 啟動 ngrok 隧道，指定本地端口
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
    // stop ngrok
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
    // on unload
    async onunload() {
        await this.stopServer();
        await this.stopNgrok();
        if (this.ngrokProcess) {
            this.ngrokProcess.kill();
        }
        if (this.serverProcess) {
            this.serverProcess.kill();
        }
    }
}
// Setting tab
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

        const portInfo = new Setting(containerEl)
            .setName('Server Port')
            .setDesc('8080');

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

        new Setting(containerEl)
            // ngrok start 
            .addButton(button => {
                button
                    .setButtonText('Start Ngrok')
                    .setClass('mod-cta')
                    .onClick(async () => {
                        await this.plugin.startNgrok();
                        this.display();
                    });
            })
            //ngrok stop
            .addButton(button => {
                button
                    .setButtonText('Stop Ngrok')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        await this.plugin.stopNgrok();
                        this.display();
                    });
            })
            // server start
            .addButton(button => {
                button
                    .setButtonText('Run server')
                    .setClass('mod-cta')
                    .onClick(async () => {
                        await this.plugin.startServer();
                        this.display();
                    });
            })
            // server stop
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
// File selection modal
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