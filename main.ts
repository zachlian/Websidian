// main.ts
import { App, Plugin, Notice, TFile, Modal, Setting, PluginSettingTab } from 'obsidian';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

// interface for settings
interface WebsidianSettings {
    ports: number[];
}
// setting tab
const DEFAULT_SETTINGS: WebsidianSettings = {
    ports: []
};

export default class WebsidianPlugin extends Plugin {
    settings: WebsidianSettings;
    private serverProcess: any = null;

    async onload() { // triggered when the plugin is loaded
        console.log('Loading Websidian plugin');
        
        // select & run command
        this.addCommand({
            id: 'select-file-and-execute',
            name: 'Select file and run server',
            callback: () => {
                console.log('Command triggered');
                this.openFilePickerAndExecute();
            }
        });
        // view ports in settings
        await this.loadSettings();
        
        this.addSettingTab(new WebsidianSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getPluginPath(): string {
        // 获取插件目录路径
        // @ts-ignore - 使用私有 API
        const pluginPath = (this.app.vault.adapter as any).getFullPath(
            '.obsidian/plugins/websidian'
        );
        console.log('Plugin path:', pluginPath);
        return pluginPath;
    }

    async openFilePickerAndExecute() {
        console.log('Opening file picker');
        const files = this.app.vault.getFiles();
        const modal = new FileSelectionModal(this.app, files, async (file: TFile) => {
            if (file) {
                await this.executeWithPath(file.path);
            }
        });
        modal.open();
    }

    async executeWithPath(filePath: string) {
        try {
            console.log('Executing with path:', filePath);
            
            // 获取插件目录的完整路径
            const pluginPath = this.getPluginPath();
            
            // 构建 Web/main.go 的完整路径
            const mainGoPath = path.join(pluginPath, 'Web', 'main.go');
            console.log('Main.go path:', mainGoPath);
            
            // 获取 vault 的根路径（用于构建文件的完整路径）
            const vaultPath = (this.app.vault.adapter as any).getBasePath();
            const absoluteFilePath = path.join(vaultPath, filePath);
            console.log('Absolute file path:', absoluteFilePath);

            // 读取 main.go 文件内容
            let content = fs.readFileSync(mainGoPath, 'utf8');
            
            // 替换 file_path 变量，使用绝对路径
            content = content.replace(
                /var\s+file_path\s*=\s*"[^"]*"/,
                `var file_path = "${absoluteFilePath.replace(/\\/g, '\\\\')}"`
            );
            
            // 写回文件
            fs.writeFileSync(mainGoPath, content);

            // 切换到 Web 目录并执行 go run main.go
            const webDir = path.join(pluginPath, 'Web');
            console.log('Executing go run in:', webDir);
            
            this.serverProcess = exec('go run main.go', { cwd: webDir }, (error, stdout, stderr) => {
                if (error) {
                    new Notice(`Error executing main.go: ${error.message}`);
                    console.error(`Error: ${error}`);
                    return;
                }
                
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                }
                
                new Notice('Server started successfully!');
                console.log(`stdout: ${stdout}`);
            });

        } catch (error) {
            new Notice(`Error: ${error.message}`);
            console.error('Error:', error);
        }
    }

    // 掃描開啟的端口並保存到設定
    async scanOpenPorts() {
        const openPorts: number[] = [];

        for (let port = 8000; port <= 9000; port++) {
            const server = net.createServer();
            server.listen(port);
            server.once('error', () => {
                openPorts.push(port);
            });
            server.close();
        }

        this.settings.ports = openPorts;
        await this.saveSettings();
    }
    // 關閉特定端口
    async closePort(port: number) {
        try {
            await fetch(`http://localhost:${port}/shutdown`);
            new Notice('Server shutting down...');
        } catch (error) {
            new Notice(`Error: ${error.message}`);
        }
    }
}

class WebsidianSettingTab extends PluginSettingTab {
    plugin: WebsidianPlugin;

    constructor(app: App, plugin: WebsidianPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'Websidian Plugin Settings' });

        // 檢視開啟的端口
        new Setting(containerEl)
            .setName('View Open Ports')
            .setDesc('Shows all currently open ports within range 8000-9000.')
            .addButton(button => {
                button.setButtonText('Scan Ports')
                    .setCta()
                    .onClick(async () => {
                        await this.plugin.scanOpenPorts();
                        this.display();  // 更新顯示
                    });
            });

        // 顯示已掃描的端口
        if (this.plugin.settings.ports.length > 0) {
            containerEl.createEl('h3', { text: 'Open Ports:' });
            this.plugin.settings.ports.forEach(port => {
                const portSetting = new Setting(containerEl)
                    .setName(`Port: ${port}`)
                    .addButton(button => {
                        button.setButtonText('Close')
                            .onClick(() => this.plugin.closePort(port));
                    });
            });
        } else {
            containerEl.createEl('p', { text: 'No open ports found.' });
        }
    }
}

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
        console.log('Modal opened');
        const { contentEl } = this;
        contentEl.empty();

        // 创建搜索输入框
        this.searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search for files...'
        });
        this.searchInput.classList.add('search-input');

        // 创建结果容器
        this.resultContainer = contentEl.createEl('div');
        this.resultContainer.classList.add('file-list-container');

        // 添加搜索事件监听器
        this.searchInput.addEventListener('input', () => {
            this.updateFileList();
        });

        // 初始显示所有文件
        this.updateFileList();

        // 聚焦搜索框
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