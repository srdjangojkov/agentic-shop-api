import { BadRequestException, Controller, Get } from "@nestjs/common";
import { CategoriesService } from "./categories.service";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async getCategories() {
    try {
      // The await runs the query inside the try, so a failure maps to the 400 below.
      return await this.categoriesService.getCategories();
    } catch {
      // Same error response as Express (decisions.md, 2026-10-19).
      throw new BadRequestException({ errors: "ERROR_GET_CATEGORIES" });
    }
  }
}
