// main.ts
import { App, Plugin, PluginSettingTab, Setting, normalizePath, Notice } from 'obsidian';

interface FilePathGetterPluginSettings {
	lastUsedPath: string;
}

const DEFAULT_SETTINGS: FilePathGetterPluginSettings = {
	lastUsedPath: ''
}

export default class FilePathGetterPlugin extends Plugin {
	settings: FilePathGetterPluginSettings;

	async onload() {
		await this.loadSettings();

		// 添加获取文件路径的命令
		this.addCommand({
			id: 'open-file-and-get-path',
			name: 'Open file picker and get path',
			callback: () => this.openFilePickerAndGetPath()
		});

		// 添加设置选项卡
		this.addSettingTab(new FilePathGetterSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openFilePickerAndGetPath() {
		// 获取 vault 中的所有文件
		const files = this.app.vault.getFiles();
		
		// 创建文件选择器模态框
		const modal = new FileSelectionModal(this.app, files, async (file: TFile) => {
			if (file) {
				// 获取文件的相对路径
				const filePath = normalizePath(file.path);
				
				// 保存最后使用的路径
				this.settings.lastUsedPath = filePath;
				await this.saveSettings();

				// 显示文件路径
				new Notice(`File path: ${filePath}`);
				
				// 可以选择将路径复制到剪贴板
				await navigator.clipboard.writeText(filePath);
				new Notice('Path copied to clipboard!');
			}
		});

		modal.open();
	}
}

// 文件选择器模态框
import { Modal, TFile } from 'obsidian';

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

		// 创建搜索输入框
		this.searchInput = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Search for files...',
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

		// 清空并重新填充结果容器
		this.resultContainer.empty();

		this.filteredFiles.forEach(file => {
			const fileItem = this.resultContainer.createEl('div', {
				text: file.path,
				cls: 'file-item',
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

// 设置选项卡
class FilePathGetterSettingTab extends PluginSettingTab {
	plugin: FilePathGetterPlugin;

	constructor(app: App, plugin: FilePathGetterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'File Path Getter Settings' });

		new Setting(containerEl)
			.setName('Last used path')
			.setDesc('The path of the last selected file')
			.addText(text => text
				.setPlaceholder('No file selected yet')
				.setValue(this.plugin.settings.lastUsedPath)
				.setDisabled(true));
	}
}