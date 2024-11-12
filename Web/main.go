package main

import (
	"context"
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/gin-contrib/cors"
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
	r.Use(cors.Default())
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

	// 使用 http.Server 控制伺服器
	srv := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	// 定義 /shutdown 路由，用於觸發伺服器關閉
	r.GET("/shutdown", func(c *gin.Context) {
		c.String(http.StatusOK, "Server is shutting down...")
		go func() {
			if err := srv.Shutdown(context.Background()); err != nil {
				fmt.Printf("Server forced to shutdown: %v\n", err)
			}
		}()
	})

	// 啟動伺服器
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Error starting server: %v\n", err)
		}
	}()
	fmt.Println("Server started on port 8080")

	// 設置關閉控制，等待中斷信號來優雅地關閉伺服器
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit
	fmt.Println("Shutting down server...")

	// 設置5秒的超時來關閉伺服器，確保端口釋放
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		fmt.Printf("Server forced to shutdown: %v\n", err)
	}

	fmt.Println("Server exiting")
}
