"use client";

type HomePhasedDescriptionProps = {
  className?: string;
  text: string;
};

export function HomePhasedDescription({
  className,
  text,
}: HomePhasedDescriptionProps) {
  return (
    <p className={["home-phased-description", className].filter(Boolean).join(" ")}>
      <span key={text} className="home-phased-description__text">
        {text}
      </span>
    </p>
  );
}
