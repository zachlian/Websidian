// main.ts
import { App, Plugin, Notice, TFile, Modal } from 'obsidian';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export default class WebsidianPlugin extends Plugin {
    async onload() {
        console.log('Loading Websidian plugin');
        
        // 添加命令
        this.addCommand({
            id: 'select-file-and-execute',
            name: 'Select file and run server',
            callback: () => {
                console.log('Command triggered');
                this.openFilePickerAndExecute();
            }
        });
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
            
            // 检查 Web/main.go 是否存在
            if (!fs.existsSync(mainGoPath)) {
                new Notice('Error: Web/main.go not found!');
                console.error('main.go not found at:', mainGoPath);
                return;
            }

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
            
            exec('go run main.go', { cwd: webDir }, (error, stdout, stderr) => {
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