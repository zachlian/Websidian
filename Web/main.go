package main

import (
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/russross/blackfriday/v2"
)

var file_path = "C:\\Users\\45685\\桌面\\Desktop\\Obsidian\\todo.md"

func renderMarkdownToHTML(mdContent []byte) template.HTML {
	// Convert markdown to HTML using blackfriday
	output := blackfriday.Run(mdContent)
	return template.HTML(output)
}

func main() {
	r := gin.Default()

	// Load HTML templates
	r.LoadHTMLGlob("templates/*")

	// Route for displaying markdown as HTML
	r.GET("/", func(c *gin.Context) {
		mdFile := file_path
		mdContent, err := ioutil.ReadFile(mdFile)
		if err != nil {
			c.String(http.StatusInternalServerError, "Error reading file: %v", err)
			return
		}
		htmlContent := renderMarkdownToHTML(mdContent)
		c.HTML(http.StatusOK, "index.html", gin.H{
			"content": htmlContent,
		})
	})

	// Start the server
	err := r.Run(":8080")
	if err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}
