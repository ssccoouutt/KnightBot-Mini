const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Google Drive API Configuration
const TOKEN_URL = "https://drive.usercontent.google.com/download?id=1NZ3NvyVBnK85S8f5eTZJS5uM5c59xvGM&export=download";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

class GoogleDrive {
    constructor() {
        this.tokenData = null;
        this.tokenFilename = null;
    }

    /**
     * Get valid access token (auto-refreshes if expired)
     */
    async getAccessToken() {
        try {
            if (!this.tokenData) {
                await this.loadToken();
            }
            
            const expiryDate = new Date(this.tokenData.expiry);
            if (new Date() > expiryDate) {
                await this.refreshToken();
            }
            
            return this.tokenData.token;
        } catch (error) {
            throw new Error(`Failed to get access token: ${error.message}`);
        }
    }

    /**
     * Load token from Google Drive
     */
    async loadToken() {
        console.log('📥 Downloading token.json...');
        
        const tokenResponse = await axios({
            method: 'GET',
            url: TOKEN_URL,
            responseType: 'stream',
            timeout: 30000
        });
        
        this.tokenFilename = path.join(process.cwd(), 'temp', `token_${Date.now()}.json`);
        const tokenWriter = fs.createWriteStream(this.tokenFilename);
        tokenResponse.data.pipe(tokenWriter);
        
        await new Promise((resolve, reject) => {
            tokenWriter.on('finish', resolve);
            tokenWriter.on('error', reject);
        });
        
        this.tokenData = JSON.parse(fs.readFileSync(this.tokenFilename, 'utf8'));
        console.log('✅ Token loaded');
    }

    /**
     * Refresh expired token
     */
    async refreshToken() {
        console.log('🔄 Refreshing token...');
        
        const refreshData = {
            client_id: this.tokenData.client_id,
            client_secret: this.tokenData.client_secret,
            refresh_token: this.tokenData.refresh_token,
            grant_type: 'refresh_token'
        };
        
        const refreshResponse = await axios.post(this.tokenData.token_uri, refreshData);
        this.tokenData.token = refreshResponse.data.access_token;
        this.tokenData.expiry = new Date(Date.now() + 3600 * 1000).toISOString();
        
        console.log('✅ Token refreshed');
    }

    /**
     * Clean up token file
     */
    cleanup() {
        if (this.tokenFilename && fs.existsSync(this.tokenFilename)) {
            fs.unlinkSync(this.tokenFilename);
            this.tokenFilename = null;
            this.tokenData = null;
        }
    }

    // ==================== FILE OPERATIONS ====================

    /**
     * List files/folders in a directory
     * @param {string} folderId - Folder ID (default: 'root')
     * @returns {Array} List of files and folders
     */
    async listFiles(folderId = 'root') {
        const token = await this.getAccessToken();
        
        const response = await axios.get(`${FILE_URL}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
                pageSize: 100
            }
        });
        
        return response.data.files;
    }

    /**
     * Create a folder
     * @param {string} folderName - Name of the folder
     * @param {string} parentId - Parent folder ID (default: 'root')
     * @returns {Object} Folder info
     */
    async createFolder(folderName, parentId = 'root') {
        const token = await this.getAccessToken();
        
        const metadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        };
        
        const response = await axios.post(FILE_URL, metadata, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        return {
            id: response.data.id,
            name: folderName,
            webViewLink: `https://drive.google.com/drive/folders/${response.data.id}`
        };
    }

    /**
     * Upload file to specific folder
     * @param {string} filePath - Local file path
     * @param {string} folderId - Folder ID (default: 'root')
     * @param {string} customFilename - Custom filename (optional)
     * @returns {Object} File info
     */
    async uploadToFolder(filePath, folderId = 'root', customFilename = null) {
        const token = await this.getAccessToken();
        const filename = customFilename || path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;
        
        console.log(`📤 Uploading ${filename} to folder ${folderId}...`);
        
        const formData = new FormData();
        formData.append('metadata', JSON.stringify({ 
            name: filename, 
            parents: [folderId] 
        }), { contentType: 'application/json' });
        
        formData.append('file', fs.createReadStream(filePath));
        
        const uploadResponse = await axios.post(UPLOAD_URL, formData, {
            params: { uploadType: 'multipart' },
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            }
        });
        
        const fileId = uploadResponse.data.id;
        
        // Make public
        await this.makePublic(fileId);
        
        return {
            id: fileId,
            name: filename,
            size: fileSize,
            folderId: folderId,
            viewLink: `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`,
            downloadLink: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
        };
    }

    /**
     * Upload from URL to specific folder
     * @param {string} fileUrl - URL to download from
     * @param {string} folderId - Folder ID (default: 'root')
     * @param {string} customFilename - Custom filename (optional)
     * @returns {Object} File info
     */
    async uploadFromUrlToFolder(fileUrl, folderId = 'root', customFilename = null) {
        console.log(`📥 Downloading from URL...`);
        
        const fileResponse = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
            timeout: 300000,
            maxRedirects: 5
        });
        
        let filename = customFilename || fileUrl.split('/').pop().split('?')[0];
        if (!filename || filename === '' || !filename.includes('.')) {
            filename = `file_${Date.now()}.bin`;
        }
        
        const contentDisposition = fileResponse.headers['content-disposition'];
        if (contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match) filename = match[1].replace(/['"]/g, '');
        }
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, `download_${Date.now()}_${filename}`);
        const fileStream = fs.createWriteStream(tempFile);
        
        fileResponse.data.pipe(fileStream);
        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        
        const result = await this.uploadToFolder(tempFile, folderId, filename);
        fs.unlinkSync(tempFile);
        
        return result;
    }

    /**
     * Make file public
     * @param {string} fileId - File ID
     */
    async makePublic(fileId) {
        try {
            const token = await this.getAccessToken();
            await axios.post(`${FILE_URL}/${fileId}/permissions`, {
                role: 'reader',
                type: 'anyone'
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            // Ignore permission errors
        }
    }

    /**
     * Download file from Google Drive
     * @param {string} fileId - File ID to download
     * @param {string} savePath - Where to save (optional)
     * @returns {string} Path where file was saved
     */
    async downloadFile(fileId, savePath = null) {
        const token = await this.getAccessToken();
        
        // Get file metadata first
        const metadataResponse = await axios.get(`${FILE_URL}/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { fields: 'name, mimeType, size' }
        });
        
        const filename = metadataResponse.data.name;
        const fileSize = metadataResponse.data.size;
        
        console.log(`📥 Downloading ${filename} (${(fileSize/1024/1024).toFixed(2)} MB)...`);
        
        // Download file
        const downloadResponse = await axios.get(`${FILE_URL}/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { alt: 'media' },
            responseType: 'stream'
        });
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const outputPath = savePath || path.join(tempDir, `download_${Date.now()}_${filename}`);
        const writer = fs.createWriteStream(outputPath);
        
        downloadResponse.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        console.log(`✅ Downloaded to: ${outputPath}`);
        return outputPath;
    }

    /**
     * Read a text file from Google Drive
     * @param {string} fileId - File ID
     * @returns {string} File content
     */
    async readTextFile(fileId) {
        const filePath = await this.downloadFile(fileId);
        const content = fs.readFileSync(filePath, 'utf8');
        fs.unlinkSync(filePath); // Clean up temp file
        return content;
    }

    /**
     * Write/Update a text file in Google Drive
     * @param {string} content - Text content to write
     * @param {string} filename - Name of the file
     * @param {string} folderId - Folder ID (default: 'root')
     * @returns {Object} File info
     */
    async writeTextFile(content, filename, folderId = 'root') {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, `text_${Date.now()}_${filename}`);
        fs.writeFileSync(tempFile, content, 'utf8');
        
        const result = await this.uploadToFolder(tempFile, folderId, filename);
        fs.unlinkSync(tempFile);
        
        return result;
    }

    /**
     * Edit/Append to an existing text file
     * @param {string} fileId - File ID to edit
     * @param {string} newContent - New content (replaces entire file)
     * @returns {Object} Updated file info
     */
    async editTextFile(fileId, newContent) {
        // Get current file metadata
        const token = await this.getAccessToken();
        const metadataResponse = await axios.get(`${FILE_URL}/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { fields: 'name, parents' }
        });
        
        const filename = metadataResponse.data.name;
        const parentId = metadataResponse.data.parents?.[0] || 'root';
        
        // Create temp file with new content
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, `edit_${Date.now()}_${filename}`);
        fs.writeFileSync(tempFile, newContent, 'utf8');
        
        // Upload as new version (Drive doesn't support direct editing, must upload new version)
        const result = await this.uploadToFolder(tempFile, parentId, filename);
        fs.unlinkSync(tempFile);
        
        // Delete old file
        await this.deleteFile(fileId);
        
        return result;
    }

    /**
     * Append to a text file
     * @param {string} fileId - File ID
     * @param {string} appendContent - Content to append
     * @returns {Object} Updated file info
     */
    async appendToTextFile(fileId, appendContent) {
        const currentContent = await this.readTextFile(fileId);
        const newContent = currentContent + '\n' + appendContent;
        return await this.editTextFile(fileId, newContent);
    }

    /**
     * Delete a file
     * @param {string} fileId - File ID to delete
     */
    async deleteFile(fileId) {
        const token = await this.getAccessToken();
        await axios.delete(`${FILE_URL}/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`🗑️ Deleted file: ${fileId}`);
    }

    /**
     * Move file to another folder
     * @param {string} fileId - File ID
     * @param {string} newFolderId - Destination folder ID
     * @returns {Object} Updated file info
     */
    async moveFile(fileId, newFolderId) {
        const token = await this.getAccessToken();
        
        // Get current parents
        const response = await axios.get(`${FILE_URL}/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { fields: 'parents' }
        });
        
        const currentParents = response.data.parents?.join(',') || '';
        
        // Move to new folder
        const moveResponse = await axios.patch(`${FILE_URL}/${fileId}`, {
            addParents: newFolderId,
            removeParents: currentParents
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        return {
            id: fileId,
            newFolder: newFolderId,
            webViewLink: `https://drive.google.com/file/d/${fileId}/view`
        };
    }

    /**
     * Search for files by name
     * @param {string} query - Search query
     * @returns {Array} Matching files
     */
    async searchFiles(query) {
        const token = await this.getAccessToken();
        
        const response = await axios.get(`${FILE_URL}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            params: {
                q: `name contains '${query}' and trashed=false`,
                fields: 'files(id, name, mimeType, size, webViewLink)'
            }
        });
        
        return response.data.files;
    }
}

module.exports = GoogleDrive;
