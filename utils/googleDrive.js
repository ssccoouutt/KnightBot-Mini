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
        // Load token if not loaded
        if (!this.tokenData) {
            await this.loadToken();
        }
        
        // Check if token needs refresh
        if (this.isTokenExpired()) {
            await this.refreshToken();
        }
        
        return this.tokenData.token;
    }

    /**
     * Check if token is expired
     */
    isTokenExpired() {
        if (!this.tokenData || !this.tokenData.expiry) return true;
        const expiryDate = new Date(this.tokenData.expiry);
        return new Date() > expiryDate;
    }

    /**
     * Load token from Google Drive
     */
    async loadToken() {
        try {
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
        } catch (error) {
            throw new Error(`Failed to load token: ${error.message}`);
        }
    }

    /**
     * Refresh expired token
     */
    async refreshToken() {
        try {
            console.log('🔄 Token expired, refreshing...');
            
            const refreshData = {
                client_id: this.tokenData.client_id,
                client_secret: this.tokenData.client_secret,
                refresh_token: this.tokenData.refresh_token,
                grant_type: 'refresh_token'
            };
            
            const refreshResponse = await axios.post(this.tokenData.token_uri, refreshData);
            
            // Update token data
            this.tokenData.token = refreshResponse.data.access_token;
            this.tokenData.expiry = new Date(Date.now() + 3600 * 1000).toISOString();
            
            console.log('✅ Token refreshed successfully');
        } catch (error) {
            throw new Error(`Failed to refresh token: ${error.message}`);
        }
    }

    /**
     * Make API request with auto token refresh
     */
    async request(config, retryCount = 0) {
        try {
            const token = await this.getAccessToken();
            
            // Add auth header
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${token}`
            };
            
            const response = await axios(config);
            return response.data;
            
        } catch (error) {
            // If 401 Unauthorized and we haven't retried yet, refresh token and retry
            if (error.response?.status === 401 && retryCount === 0) {
                console.log('🔄 Token invalid, refreshing and retrying...');
                await this.refreshToken();
                return this.request(config, retryCount + 1);
            }
            throw error;
        }
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
     * Check if file exists
     */
    async fileExists(fileId) {
        try {
            await this.request({
                method: 'GET',
                url: `${FILE_URL}/${fileId}`,
                params: { fields: 'id' }
            });
            return true;
        } catch (error) {
            if (error.response?.status === 404) return false;
            throw error;
        }
    }

    /**
     * Get file metadata
     */
    async getFileInfo(fileId) {
        return await this.request({
            method: 'GET',
            url: `${FILE_URL}/${fileId}`,
            params: { fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, parents' }
        });
    }

    /**
     * List files/folders in a directory
     */
    async listFiles(folderId = 'root') {
        return await this.request({
            method: 'GET',
            url: FILE_URL,
            params: {
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)',
                pageSize: 100
            }
        });
    }

    /**
     * Create a folder
     */
    async createFolder(folderName, parentId = 'root') {
        const result = await this.request({
            method: 'POST',
            url: FILE_URL,
            data: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            }
        });
        
        return {
            id: result.id,
            name: folderName,
            webViewLink: `https://drive.google.com/drive/folders/${result.id}`
        };
    }

    /**
     * Upload file to specific folder
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
        
        const response = await axios.post(`${UPLOAD_URL}?uploadType=multipart`, formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...formData.getHeaders()
            }
        });
        
        const fileId = response.data.id;
        
        // Make public
        await this.makePublic(fileId).catch(() => {});
        
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
     */
    async uploadFromUrlToFolder(fileUrl, folderId = 'root', customFilename = null) {
        console.log(`📥 Downloading from URL...`);
        
        const response = await axios({
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
        
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match) filename = match[1].replace(/['"]/g, '');
        }
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, `download_${Date.now()}_${filename}`);
        const writer = fs.createWriteStream(tempFile);
        
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        const result = await this.uploadToFolder(tempFile, folderId, filename);
        fs.unlinkSync(tempFile);
        
        return result;
    }

    /**
     * Make file public
     */
    async makePublic(fileId) {
        try {
            await this.request({
                method: 'POST',
                url: `${FILE_URL}/${fileId}/permissions`,
                data: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        } catch (e) {
            // Ignore permission errors
        }
    }

    /**
     * Download file from Google Drive
     */
    async downloadFile(fileId, savePath = null) {
        const info = await this.getFileInfo(fileId);
        const filename = info.name;
        const fileSize = info.size;
        
        console.log(`📥 Downloading ${filename} (${(fileSize/1024/1024).toFixed(2)} MB)...`);
        
        const token = await this.getAccessToken();
        const response = await axios({
            method: 'GET',
            url: `${FILE_URL}/${fileId}`,
            params: { alt: 'media' },
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream'
        });
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const outputPath = savePath || path.join(tempDir, `download_${Date.now()}_${filename}`);
        const writer = fs.createWriteStream(outputPath);
        
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
        console.log(`✅ Downloaded to: ${outputPath}`);
        return outputPath;
    }

    /**
     * Read a text file from Google Drive
     */
    async readTextFile(fileId) {
        const filePath = await this.downloadFile(fileId);
        const content = fs.readFileSync(filePath, 'utf8');
        fs.unlinkSync(filePath);
        return content;
    }

    /**
     * Write/Update a text file in Google Drive
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
     * Edit/Update an existing text file
     */
    async editTextFile(fileId, newContent) {
        // Check if file exists
        const exists = await this.fileExists(fileId);
        if (!exists) {
            throw new Error(`File with ID ${fileId} not found`);
        }
        
        // Get current file metadata
        const info = await this.getFileInfo(fileId);
        const filename = info.name;
        const parentId = info.parents?.[0] || 'root';
        
        // Create temp file with new content
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, `edit_${Date.now()}_${filename}`);
        fs.writeFileSync(tempFile, newContent, 'utf8');
        
        // Upload as new version
        const result = await this.uploadToFolder(tempFile, parentId, filename);
        fs.unlinkSync(tempFile);
        
        // Delete old file
        await this.deleteFile(fileId).catch(() => {});
        
        return result;
    }

    /**
     * Append to a text file
     */
    async appendToTextFile(fileId, appendContent) {
        const currentContent = await this.readTextFile(fileId);
        const newContent = currentContent + '\n' + appendContent;
        return await this.editTextFile(fileId, newContent);
    }

    /**
     * Delete a file
     */
    async deleteFile(fileId) {
        await this.request({
            method: 'DELETE',
            url: `${FILE_URL}/${fileId}`
        });
        console.log(`🗑️ Deleted file: ${fileId}`);
    }

    /**
     * Move file to another folder
     */
    async moveFile(fileId, newFolderId) {
        const info = await this.getFileInfo(fileId);
        const currentParents = info.parents?.join(',') || '';
        
        const result = await this.request({
            method: 'PATCH',
            url: `${FILE_URL}/${fileId}`,
            params: {
                addParents: newFolderId,
                removeParents: currentParents
            }
        });
        
        return {
            id: fileId,
            newFolder: newFolderId,
            webViewLink: `https://drive.google.com/file/d/${fileId}/view`
        };
    }

    /**
     * Search for files by name
     */
    async searchFiles(query) {
        return await this.request({
            method: 'GET',
            url: FILE_URL,
            params: {
                q: `name contains '${query}' and trashed=false`,
                fields: 'files(id, name, mimeType, size, webViewLink)'
            }
        });
    }
}

module.exports = GoogleDrive;
