package com.thx.traveljournal.publicapi.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** 页面跳转：把 /admin 补全到后台的静态首页。 */
@Controller
public class PageController {

    @GetMapping({"/admin", "/admin/"})
    public String admin() {
        return "redirect:/admin/index.html";
    }
}
