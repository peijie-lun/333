export function facilityCarousel() {
  return {
    type: "flex",
    altText: "公共設施資訊",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://today-obs.line-scdn.net/0h-NdfKUUZcmFZH1sCDogNNmNJcQ5qc2FiPSkjYhpxLFUjLjAzNSs8D3pKfgZ1KTU_Ny44D34WaVAmKjQ-ZSo8/w1200",
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "健身房\n開放時間：06:00 - 22:00", wrap: true },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://www.ytyut.com/uploads/news/1000/3/d3156e6f-9126-46cd.jpg",
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "游泳池\n開放時間：08:00 - 20:00", wrap: true },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://www.gogo-engineering.com/store_image/ydplan/file/D1695800312494.jpg",
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "大廳\n開放時間：全天", wrap: true },
            ],
          },
        },
      ],
    },
  };
}

export function buildImageCarousel(images) {
  return {
    type: "flex",
    altText: "圖片資訊",
    contents: {
      type: "carousel",
      contents: images.map((item) => ({
        type: "bubble",
        hero: {
          type: "image",
          url: item.url,
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: item.description || "圖片", wrap: true },
          ],
        },
      })),
    },
  };
}
